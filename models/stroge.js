const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const storgeSchema = new Schema({
  itemName: { type: String, required: true },
  itemNumber: { type: String, required: true, unique: true },
  itemType: { type: String, required: true },
  qin: {
    type: Number,
    required: true,
  },
});

const Storge = mongoose.model("Storge", storgeSchema);

module.exports = Storge;
