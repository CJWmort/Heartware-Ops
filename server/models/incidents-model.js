const mongoose = require("mongoose");

const IncidentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "STUDENT_UNWELL",
        "STUDENT_MISSING",
        "BUS_DELAYED",
        "BUS_BREAKDOWN",
        "LOST_ITEM",
        "OTHERS",
      ],
      required: true,
    },
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    note: { type: String, maxlength: 500 },
    slotId: String,
    school: String,
    busNo: String,
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
    location: { lat: Number, lng: Number },
    address: String,
    status: { type: String, enum: ["new", "acknowledged", "resolved"], default: "new" },
    history: [{ status: String, note: String, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true },
);

const Incident = mongoose.model("Incident", IncidentSchema, "incidents");

exports.create = (data) => Incident.create(data);
exports.retrieveAll = (filter) => Incident.find(filter).sort({ createdAt: -1 });
exports.retrieveById = (id) => Incident.findById(id);
