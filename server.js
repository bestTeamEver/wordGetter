require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const cheerio = require("cheerio");

app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT !== undefined ? process.env.PORT : 3000;

// super simple 'database'
const database = [];

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

/// start a session with a set of characters and preload possible words
//query in form of: localhost:3000/start?letters=abcde
app.get("/start", (req, res) => {
  //get letters being used from the query
  let letters = req.query.letters;

  //make call to dictionary api
  fetch(`https://www.anagrammer.com/word-unscrambler/${letters}`)
    .then((response) => response.text())
    .then((siteText) => {
      const $ = cheerio.load(siteText);

      let validWords = [];
      // in the div with class = vissible-sm
      $('div[class="vissible-sm"]')
        //find the <a> tags in the elements with class = r
        .find(".r > a")
        //for each <a> tag push the text content to list
        .each(function (index, element) {
          validWords.push($(element).text());
        });
      //send a json response of the list
      res.json(validWords);
    });
});

// get the high scores from the database object. Add a query of ?name=...
// to get only the high scores with that name
app.get("/scores", (req, res) => {
  let returning = database.slice();

  if (req.query.hasOwnProperty("sort")) {
    returning = sortDatabaseBy(returning, req.query.sort);
  } else {
    returning = sortDatabaseBy(returning, "high_score");
  }

  if (req.query.hasOwnProperty("name")) {
    const name = req.query.name;

    returning = returning.filter((item) => item.name === name);
  }

  if (req.query.hasOwnProperty("limit")) {
    let limit = parseInt(req.query.limit);
    limit = Number.isNaN(limit)
      ? 0
      : limit < 0
      ? 0
      : limit > returning.length
      ? returning.length
      : limit;
    returning = returning.slice(0, limit);
  }

  return res.json(returning);
});

function sortDatabaseBy(db, target) {
  let returning;
  switch (target) {
    case "name":
      returning = db.sort((item1, item2) =>
        CompareByString(item1, item2, "name")
      );
      break;
    case "high_score":
      returning = db.sort(compareByScore);
      break;
    case "date":
      returning = db.sort((item1, item2) =>
        CompareByString(item1, item2, "date")
      );
  }
  return returning;
}

function CompareByString(item1, item2, target) {
  if (item1[target] < item2[target]) {
    return -1;
  } else if (item1[target] < item2[target]) {
    return 1;
  } else {
    return compareByScore(item1, item2);
  }
}

function compareByScore(item1, item2) {
  return item2.high_score - item1.high_score;
}

app.post("/scores", (req, res) => {
  const newScore = req.body;

  // validate the object. Can only do one new high score at a time
  if (newScore !== undefined && typeof newScore === "object") {
    if (
      typeof newScore.name === "string" &&
      typeof newScore.high_score === "number" &&
      typeof newScore.date === "string"
    ) {
      database.push(newScore);
      return res.status(200).json("Complete");
    }
  }

  return res
    .status(400)
    .json(
      "Expected a single object of {name:name, high_score:number, date:date}"
    );
});
