// NEW (item 27): loads the 182 primary schools from data/primary_schools.json into the "schools" collection.
// Before this there was NO documented way to fill that collection, so a fresh database had no schools and
// "Run Allocations" had nothing to allocate to.
//
// Run with:  pnpm run seed:schools              (only fills an EMPTY schools collection; otherwise it stops and tells you)
//            pnpm run seed:schools -- --missing (NEW: keeps the schools already in the database and ADDS the ones from
//                                                primary_schools.json that are not there yet. Use this when the database
//                                                has only some of the 182 schools.)
//            pnpm run seed:schools -- --force   (deletes the existing schools first, then loads them again)
//
// UPDATE: the REAL allocation of schools to shows and reporting times lives in the team's database (not in this repo).
// If you export the schools collection from MongoDB Compass (Export Collection -> JSON) and save it as
// server/data/schools.json, this script loads THAT file as-is (same shows, same reporting times, same _ids).
// Only when that file does not exist does it fall back to primary_schools.json and invent show / reportingTime (below).
//
// IMPORTANT, read this (applies to the fallback only): primary_schools.json lists each school's name, address, zone, location and number of P5 classes,
// but NOT which NE Show the school takes part in or its reporting time. Our schema needs both (show, reportingTime).
// So this script MAKES THEM UP for demo purposes: it spreads the schools over the 4 shows so every show gets about the
// same number of classes (places), and gives each school a reporting time of 2:30pm, 3:00pm or 3:30pm.
// If you have the real timetable from HQ, change the numbers in the database (or in this script) instead of trusting these.
//
// WARNING: --force removes assignments' schools too (assignments point to school ids), so run allocation again afterwards.

const { connect, disconnect } = require("./_connect");
const mongoose = require("mongoose");
require("../models/schools-model"); // registers the "Schools" model
const fs = require("fs");
const path = require("path");
const primarySchools = require("../data/primary_schools.json");
const schedule = require("../data/schedule.json");

const REPORTING_TIMES = [
  "1:15pm",
  "1:30pm",
  "1:45pm",
  "2:00pm",
  "2:45pm",
  "3:00pm",
  "3:15pm",
  "3:30pm",
];

// Spread schools over the shows so each show ends up with a similar total of P5 classes.
// Method: take the biggest schools first, and always give the next one to the show that currently has the fewest classes.
// (Sorting by name first makes the result the same every time you run it.)
// startTotals (NEW) = classes each show already has, so --missing keeps the shows balanced with the schools already stored.
function spreadOverShows(list, showNames, startTotals = {}) {
  const totals = Object.fromEntries(showNames.map((n) => [n, startTotals[n] || 0]));
  return [...list]
    .sort((a, b) => b.p5Classes - a.p5Classes || a.name.localeCompare(b.name))
    .map((school, i) => {
      const show = showNames.reduce(
        (least, n) => (totals[n] < totals[least] ? n : least),
        showNames[0],
      );
      totals[show] += school.p5Classes;
      return { ...school, show, reportingTime: REPORTING_TIMES[i % REPORTING_TIMES.length] };
    });
}

// NEW: read the Compass export if it is there. Compass writes ids like {"$oid": "6ac9..."}, so turn those back into real
// ObjectIds (keeping the ids means assignments that point at a school id keep working on a copy of the database).
const EXPORT_FILE = path.join(__dirname, "..", "data", "schools.json");
function readExport() {
  if (!fs.existsSync(EXPORT_FILE)) return null;
  const rows = JSON.parse(fs.readFileSync(EXPORT_FILE, "utf8"));
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("data/schools.json must be a non-empty JSON array.");
  return rows.map((row) => {
    const { __v, createdAt, updatedAt, ...doc } = row; // drop bookkeeping fields Mongo adds itself
    if (doc._id && doc._id.$oid) doc._id = new mongoose.Types.ObjectId(doc._id.$oid);
    for (const field of [
      "name",
      "address",
      "postalCode",
      "zone",
      "lat",
      "lng",
      "p5Classes",
      "reportingTime",
      "show",
    ]) {
      if (doc[field] === undefined)
        throw new Error(`data/schools.json: "${doc.name || "?"}" has no ${field}.`);
    }
    return doc;
  });
}

async function main() {
  const force = process.argv.includes("--force");
  const missingOnly = process.argv.includes("--missing");
  await connect();
  const Schools = mongoose.model("Schools");

  // NEW: --missing. Add only the schools whose name is not in the database yet; never change or delete an existing one.
  if (missingOnly && !force) {
    const stored = await Schools.find().lean();
    const have = new Set(stored.map((x) => x.name.trim().toLowerCase()));
    const toAdd = primarySchools.filter((x) => !have.has(x.name.trim().toLowerCase()));
    if (toAdd.length === 0) {
      console.log(
        `All ${primarySchools.length} schools from primary_schools.json are already in the database. Nothing added.`,
      );
      await disconnect();
      return;
    }
    const showNames = schedule.map((x) => x.name);
    const startTotals = {};
    for (const x of stored) startTotals[x.show] = (startTotals[x.show] || 0) + x.p5Classes;
    const added = spreadOverShows(toAdd, showNames, startTotals);
    await Schools.insertMany(added);
    const after = { ...startTotals };
    for (const x of added) after[x.show] = (after[x.show] || 0) + x.p5Classes;
    console.log(
      `Kept ${stored.length} existing schools and added ${added.length} new ones (shows and reporting times of the new ones are MADE UP).`,
    );
    console.log("P5 classes (places) per show before -> after:");
    console.table(
      Object.fromEntries(showNames.map((n) => [n, `${startTotals[n] || 0} -> ${after[n] || 0}`])),
    );
    await disconnect();
    return;
  }

  const existing = await Schools.countDocuments();
  if (existing > 0 && !force) {
    console.log(`The schools collection already has ${existing} schools, so nothing was changed.`);
    console.log(
      "Add --missing to keep them and only ADD schools that are not there yet, or --force to delete them and load everything again.",
    );
    await disconnect();
    return;
  }
  if (force) await Schools.deleteMany({});

  const exported = readExport();
  const docs =
    exported ||
    spreadOverShows(
      primarySchools,
      schedule.map((s) => s.name),
    ); // real file wins, made-up spread is the fallback
  console.log(
    exported
      ? "Using data/schools.json (the real allocation of schools to shows)."
      : "data/schools.json not found: using primary_schools.json with MADE-UP shows and reporting times.",
  );
  await Schools.insertMany(docs);

  const perShow = {};
  for (const d of docs) perShow[d.show] = (perShow[d.show] || 0) + d.p5Classes;
  console.log(`Loaded ${docs.length} schools. P5 classes (places) per show:`);
  console.table(perShow);
  await disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
