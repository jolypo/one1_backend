const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const fs = require("fs");
const path = require("path");
const coustmerSchema = new Schema(
  {
      name: { type: String, required: true },
      rank: { type: String, required: true },
      number: { type: String, required: true , index:true},
      receiverSignature: { type: String, required: true }, // Base64
    },
  
);

const Coustmer = mongoose.model("Coustmer", coustmerSchema);
module.exports = Coustmer;
