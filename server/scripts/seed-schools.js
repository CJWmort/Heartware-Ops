// Script that loads the schools from the data export into the database and spreads them over the
// shows.

const { connect, disconnect } = require("./_connect");
const mongoose = require("mongoose");
require("../models/schools-model");
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

// spreadOverShows(list, showNames, startTotals) - makes up a fair split of schools over the shows. 1)
// start each show's total at startTotals (or 0) 2) sort schools biggest first (ties by name, so the
// result is repeatable) 3) give each school to the show with the fewest classes so far 4) add the
// school's classes to that show 5) assign a reporting time by cycling through the list. Returns the
// schools with show and reportingTime added.
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

const EXPORT_FILE = path.join(__dirname, "..", "data", "schools.json");
// readExport() - reads data/schools.json (a MongoDB Compass export) if it exists. 1) missing file ->
// null 2) must be a non-empty array 3) drop bookkeeping fields (__v, createdAt, updatedAt) 4) turn {
// $oid } ids back into ObjectIds 5) check all required fields exist 6) return the documents.
function readExport() {
  if (!fs.existsSync(EXPORT_FILE)) return null;
  const rows = JSON.parse(fs.readFileSync(EXPORT_FILE, "utf8"));
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("data/schools.json must be a non-empty JSON array.");
  return rows.map((row) => {
    const { __v, createdAt, updatedAt, ...doc } = row;
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

// main() - loads the schools. 1) --missing: add only schools whose name is not stored yet and print
// the before/after classes per show 2) otherwise stop if schools already exist (unless --force) 3)
// --force deletes the existing schools first 4) use data/schools.json if present, else
// primary_schools.json with MADE-UP shows and times 5) insert and print classes per show.
async function main() {
  const force = process.argv.includes("--force");
  const missingOnly = process.argv.includes("--missing");
  await connect();
  const Schools = mongoose.model("Schools");

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
    );
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
