require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const MongoClient = require("mongodb").MongoClient;

app.use(cors());
app.use(bodyParser.json());

const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.isdmt.mongodb.net/worseWordScapes.high_scores?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const PORT = process.env.PORT !== undefined ? process.env.PORT : 3000;

const letterFrequencies = {
  E: 0.1202,
  T: 0.091,
  A: 0.0812,
  O: 0.0768,
  I: 0.0731,
  N: 0.0695,
  S: 0.0628,
  R: 0.0602,
  H: 0.0592,
  D: 0.0432,
  L: 0.0398,
  U: 0.0288,
  C: 0.0271,
  M: 0.0261,
  F: 0.023,
  Y: 0.0211,
  W: 0.0209,
  G: 0.0203,
  P: 0.0182,
  B: 0.0149,
  V: 0.0111,
  K: 0.0069,
  X: 0.0017,
  Q: 0.0011,
  J: 0.001,
  Z: 0.0007,
};

// get the characters for this round. accepts a number for number of characters to use
function getRoundCharacters(numCharacters) {
  const characters = [];

  for (let i = 0; i < numCharacters; i++) {
    characters.push(getValueFromLetterFreqs(Math.random()));
  }

  return characters;
}

// finds the appropiate letter from the frequency table (requires number to be between 0 and 1, otherwise only return 'Z')
function getValueFromLetterFreqs(num) {
  let sum = 0;
  for (item in letterFrequencies) {
    sum += letterFrequencies[item];
    if (num < sum) {
      return item;
    }
  }
  return "Z"; // default return if doesn't work
}

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

/// start a session with a set of characters and preload possible words
//query in form of: localhost:3000/start?letters=number
app.get("/start", (req, res) => {
  //get letters being used from the query
  let letters = req.query.letters;
  scrapeWords(res, letters);
});

function scrapeWords(res, numletters) {
  let letters = getRoundCharacters(numletters);

  //make call to dictionary api
  fetch(`https://www.anagrammer.com/word-unscrambler/${letters.join("")}`)
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

      validWords = validWords.filter((item) => item.length > 2);

      if (validWords.length > 1) {
        //send a json response of the list
        res.json({ letters: letters, words: validWords });
      } else {
        scrapeWords(res, numletters);
      }
    });
}

// get the high scores from the database object. Add a query of ?name=...
// to get only the high scores with that name
app.get("/scores", (req, res) => {
  client.connect((err) => {
    const collection = client.db("worseWordScapes").collection("high_scores");
    // perform actions on the collection object
    collection
      .find({})
      .toArray()
      .then((data) => res.json(filterQuery(req.query, data)));
  });
});

function filterQuery(query, returning) {
  if (query.hasOwnProperty("sort")) {
    returning = sortDatabaseBy(returning, req.query.sort);
  } else {
    returning = sortDatabaseBy(returning, "high_score");
  }

  if (query.hasOwnProperty("name")) {
    const name = query.name;

    returning = returning.filter((item) => item.name === name);
  }

  if (query.hasOwnProperty("limit")) {
    let limit = parseInt(query.limit);
    limit = Number.isNaN(limit)
      ? 0
      : limit < 0
      ? 0
      : limit > returning.length
      ? returning.length
      : limit;
    returning = returning.slice(0, limit);
  }

  return returning;
}

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
      try {
        client.connect((err) => {
          const collection = client
            .db("worseWordScapes")
            .collection("high_scores");

          collection
            .insertOne(newScore)
            .then(() => res.status(200).json("Complete"));
        });
      } catch (err) {
        console.log(err);
      }
    }
  } else {
    res
      .status(400)
      .json(
        "Expected a single object of {name:name, high_score:number, date:date}"
      );
  }
});
