(() => {
"use strict";

if (!Object.entries) {
  Object.entries = function( obj ){
    var ownProps = Object.keys( obj ),
        i = ownProps.length,
        resArray = new Array(i); // preallocate the Array
    while (i--)
      resArray[i] = [ownProps[i], obj[ownProps[i]]];

    return resArray;
  };
}

const app = require("express")();
const admin = require('firebase-admin');
const functions = require('firebase-functions');
admin.initializeApp(functions.config().firebase);

const db = admin.firestore();

const defaults = {
  "tags": {
    "0": {
      "label":"r",
      "color":"#FF0000"
    },
    "1": {
      "label":"g",
      "color":"#00FF00"
    },
    "2": {
      "label":"b",
      "color":"#0000FF"
    }
  },
  "access": {
    "public": true,
    "members": [],
  },
  "column": {
    order: 0,
    new: true,
    cards: {}
  },
  "card": {
    order: 0,
    new: true,
    body: "",
    tags: []
  }
};

const error = (status, message) => {
  throw (() => {
    return {
      status: status,
      message: message
    };
  })();
};

const app_functions = {
  "util": {
    "id": (length = 20) =>
      Array(length)
        .fill()
        .map((chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') =>
          chars.charAt(Math.floor(Math.random() * chars.length)))
        .join(''),
    "template": doc =>
      Object.assign(
        doc.data(),
        {
          boardId: doc.id,
          columns: Object.entries(doc.data().columns).map(a =>
            Object.assign(
              a[1],
              {
                columnId: a[0],
                cards:
                  Object.entries(a[1].cards).map(b =>
                    Object.assign(
                      {
                        cardId: b[0]
                      },
                      b[1]
                    )
                  )
              }
            )
          )
        }
      ),
    "sort": s => {
      const e = Object.entries(s);
      e.sort((a, b) =>
        a[1].order > b[1].order || a[1].order === b[1].order && b[1].new ?
          1 :
          a[1].order < b[1].order || a[1].order === b[1].order && a[1].new ?
            -1 :
            0);
      return e.reduce((o, [k, v]) => Object.assign(o, {[k]: Object.assign(v, {order: Object.keys(o).length, new: false})}), {});
     },
    "node": (property, value) =>
      Object.defineProperty(
        {},
        property,
        {
          value: value,
          enumerable: true
        }
      ),
    "auth": (userId, boardId) =>
      db.collection("boards").doc(boardId).get()
        .then(doc =>
          doc.data().access ?
            doc.data().access.public ?
              true :
              (doc.data().access.members || []).includes(userId) ?
                true :
                error(403, "access denied") :
            error(500, "no access set")
        )
  },
  "create": {
    "card": (boardId, columnId) =>
      db.collection("boards").doc(boardId).update(
        app_functions.util.node(`columns.${columnId}.cards.${app_functions.util.id()}`, defaults.card)),
    "column": (boardId) =>
      db.collection("boards").doc(boardId).update(
        app_functions.util.node(`columns.${app_functions.util.id()}`, defaults.column)),
    "board": () =>
      db.collection("boards").add({
        tags: defaults.tags,
        access: defaults.access,
        columns: {}
      })
  },
  "read": {
    "board": (boardId) =>
      db.collection("boards").doc(boardId).get()
  },
  "update": {
    "board": {
      "dirty": (boardId) =>
        db.collection("boards").doc(boardId).update(
          app_functions.util.node(`clean`, false)),
      "access": (boardId, access) =>
        db.collection("boards").doc(boardId).update(
          app_functions.util.node(`access`, access)),
      "tags": (boardId, tags) =>
        db.collection("boards").doc(boardId).update(
          app_functions.util.node(`tags`, tags))
    },
    "column": {
      "order": (boardId, columnId, order) =>
        db.collection("boards").doc(boardId).update(
          app_functions.util.node(`columns.${columnId}.order`, order))
    },
    "card": {
      "order": (boardId, columnId, cardId, order) =>
        db.collection("boards").doc(boardId).update(
          app_functions.util.node(`columns.${columnId}.cards.${cardId}.order`, order)),
      "body": (boardId, columnId, cardId, body) =>
        db.collection("boards").doc(boardId).update(
          app_functions.util.node(`columns.${columnId}.cards.${cardId}.body`, body)),
      "tags": (boardId, columnId, cardId, tags) =>
        db.collection("boards").doc(boardId).update(
          app_functions.util.node(`columns.${columnId}.cards.${cardId}.tags`, tags))
    }
  },
  "delete": {}
};

// cors stuff
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://scoutr-4c091.firebaseapp.com");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("AMP-Access-Control-Allow-Source-Origin", req.query.__amp_source_origin);
  res.header("Access-Control-Expose-Headers", "AMP-Access-Control-Allow-Source-Origin");
  res.header("Vary", "Origin");
  next();
});

// validate user and insert ids
app.use((req, res, next) => {
  // authenitcate here and add user field to req with appropriate id
  next();
});

app.post('/board/', (req, res) =>
  app_functions.create.board()
    .then(doc =>
      res.json({result: "ok"})));

app.post('/board/:boardId/column/', (req, res) =>
  app_functions.create.column(req.params.boardId)
    .then(() =>
      app_functions.update.board.dirty(req.params.boardId))
    .then(doc =>
      res.json({result: "ok"})));

app.post('/board/:boardId/column/:columnId/card/', (req, res) =>
  app_functions.create.card(req.params.boardId, req.params.columnId)
    .then(() =>
      app_functions.update.board.dirty(req.params.boardId))
    .then(doc =>
      res.json({result: "ok"})));


app.post('/board/:boardId/column/:columnId/order/:orderValue', (req, res) =>
  app_functions.update.column.order(req.params.boardId, req.params.columnId, req.params.orderValue)
    .then(() =>
      app_functions.update.board.dirty(req.params.boardId))
    .then(doc =>
      res.json({result: "ok"})));

app.post('/board/:boardId/column/:columnId/card/:cardId/order/:orderValue', (req, res) =>
  app_functions.update.card.order(req.params.boardId, req.params.columnId, req.params.cardId, req.params.orderValue)
    .then(() =>
      app_functions.update.board.dirty(req.params.boardId))
    .then(doc =>
      res.json({result: "ok"})));

app.post('/board/:boardId/column/:columnId/card/:cardId/body/:bodyValue', (req, res) =>
  app_functions.update.card.body(req.params.boardId, req.params.columnId, req.params.cardId, req.params.bodyValue)
    .then(doc =>
      res.json({result: "ok"})));

app.get('/board/:boardId/', (req, res) =>
  app_functions.read.board(req.params.boardId)
    .then(doc =>
      res.json(app_functions.util.template(doc))));

exports.api = functions.https.onRequest(app);

exports.modifyBoard = functions.firestore.document('boards/{boardId}')
  .onWrite((change, context) => {
    const document = change.after.exists ? change.after.data() : null;
    if(!document || document.clean) return 0;
    document.columns = app_functions.util.sort(document.columns);
    Object.keys(document.columns).forEach(key => document.columns[key].cards =  document.columns[key].cards ? app_functions.util.sort(document.columns[key].cards) : {});
    return change.after.ref.update({clean: true, columns: document.columns});
  })
})();
