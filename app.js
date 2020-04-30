const express = require('express');
const app = express();
const sha256 = require('sha-256-js');
const cookieSession = require('cookie-session');
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const flash = require('connect-flash');
const textBody = bodyParser.text();
const CSV = require('csv-string');
const hbs = require('express-hbs');

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database( __dirname + '/database.db',
    function(err) {
        if ( !err ) {
            db.serialize(function() {
                db.run(`
                CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                password TEXT,
                admin BOOLEAN,
                firstName TEXT,
                lastName TEXT
                )`);
                db.run(`
                CREATE TABLE IF NOT EXISTS public (
                id INTEGER PRIMARY KEY,
                name TEXT,
                spreadSheetValues TEXT,
                shareable BOOLEAN,
                email TEXT,
                FOREIGN KEY (email) REFERENCES users(email)
                )` );
            });
            console.log('The database is opened');
        }
    });

app.use(express.static( __dirname + '/public'));
app.use(bodyParser.urlencoded( {extended: true}));
app.use(cookieSession({
    name: 'session',
    secret: 'foo'
}));

app.engine('hbs', hbs.express4({
  partialsDir: __dirname + '/views/partials',
  defaultLayout: __dirname + '/views/layout/index.hbs'
}));
app.set('view engine', 'hbs');
app.set('views', __dirname + '/views/partials');
app.use(flash());

const port = process.env.PORT || 8080;

app.get('/loadDB', function (req,res) {
  db.serialize( function () {
      db.run('INSERT INTO users (email, password, admin, firstName, lastName) VALUES(?, ?, ?, ?, ?)',["maz@mun.ca", sha256("abc"),1,"Mazmul","Mohammed"]);
      db.run('INSERT INTO users (email, password, admin, firstName, lastName) VALUES(?, ?, ?, ?, ?)',["mazmul@mun.ca", sha256("123"),0,"Mazmul","Jamil"]);
    });
  res.redirect('/');
});

//USER LOGIN
app.get('/login', function(req,res) {
  non_admins(req,res)
});

app.post('/login', jsonParser, function(req, res) {
  const loginData = req.body;
  db.get('SELECT * FROM users WHERE email=? AND password=?', [loginData.email, sha256(loginData.password)], function(err, row) {
    if (row) {
        req.session.email = row.email;
        req.session.pwd = row.password;
        req.session.admin = row.admin;
        req.session.firstName = row.firstName;
        req.session.lastName = row.lastName;
        req.session.login = true;
        generate_home_page(req,res);
        res.redirect('/home')
    }
    else {
      res.redirect('/error');
    }
  });
});

//SENDS A FAILED LOGIN MESSAGE
app.get('/error', function(req,res) {
  res.type('.html');
  res.render('error', {
      title: 'Failed Login'
  });
});

//USER REGISTRATION
app.post('/register', function(req, res) {
  const registerData = req.body;
  console.log(registerData);
  db.run('INSERT INTO users (email,password,admin,firstName,lastName) VALUES(?, ?, ?, ?, ?)',[registerData.email, sha256(registerData.password),false,registerData.fName, registerData.lName], function (err){
      if (!err) {
          console.log('New user registered.');
          req.session.email = registerData.email;
          req.session.pwd = registerData.password;
          req.session.admin = 0;
          req.session.firstName = registerData.fName;
          req.session.lastName = registerData.lName;
          req.session.login = true;
          generate_home_page(req, res)
          res.redirect('/home');
      }
      else {
          console.log(err);
          res.redirect('/error');
      }
  });
});


//REDIRECTS TO HOMEPAGE AFTER LOGIN/REGISTRATION
app.get('/home', logged, function(req, res){
  res.type('.html');
  res.render('home', {
    req : req
});
})

//REDIRECTS TO LOG IN PAGE
app.get('/', function(req, res) {
  if (req.session.login === true) {
    res.redirect('/home')
  } else {
    res.redirect("/indexx.html")
  }
});

//ADMIN AUTHENTICATION
function admin(req, res, next){
  if (req.session.login && req.session.admin === 1){
      next();
  }
  else {
      res.type('.html');
      res.render('error-page', {
          req: req
      });
  }
}

//USER AUTHENTICATION
function logged(req, res, next){
  if (req.session.login){
      next();
  }
  else {
      res.type('.html');
      res.render('error-page', {
          req: req
      });
  }
}


function non_admins( req, res ) {
  db.all('SELECT * FROM users where admin=0', [], function(err, rows) {
      if ( !err ) {
          console.log(rows);
          res.type('.html'); 
          res.render('users', {
              users : rows,
              title : 'Admin Page',
              req: req,
          });
      }
  } );
}


function generate_home_page(req, res) {
  let user = req.session;
  console.log('req',req.session.firstName);
  db.all('SELECT FROM users where firstName=?, lastName=?',[user.firstName, user.lastName], function(err,rows) {
      if(!err) {
          res.type('.html');
          res.render('home', {
              req : req ,
          })
      }
  })
}

//SAVES A SPREADSHEET
app.put( '/sheet/:name', jsonParser, (req,res) => {
  const name = req.params.name;
  const values = req.body.values;
  const status = req.body.status;
  const email = req.session.email;
  console.log( 'received sheet', values );
  const strValues = JSON.stringify( values );
  console.log(strValues)
  db.run(`INSERT OR REPLACE INTO public (name,spreadSheetValues,shareable,email) VALUES(?,?,?,?)`,
      [name,strValues,status,email],
      function(err) {
          if (!err) {
              res.send( {ok:true} ); // converts to JSON
              console.log('hits');
          }
          else {
              res.send( {ok:false} ); // converts to JSON
              console.log(err);
          }
      }
  );
});

//LOADS THE NAMED SPREADSHEET
app.get('/sheet/:name', function(req, res) {
  const email = req.session.email;
  const name = req.params.name;
  db.get('SELECT spreadSheetValues FROM public where name = ?', [name],
      function( err, row ) {
          if ( !err ) {
              console.log("fucl")
              res.send( row.spreadSheetValues );
              console.log(row.spreadSheetValues)
          }
          else {
              res.send( {err:err} );
              console.log(err)
              
          }
      }
  );
});

//LIST OF PUBLIC SPREADSHEETS
app.get('/public', function (req, res) {
  let email = req.session.email;
  db.all('SELECT name FROM public WHERE shareable = true', [], function (err,rows) {
    if (!err) {
      const names = rows.map((x) => x.name);
      res.type(".html");
      res.render("public", {
        names: names,
      });
    } else {
      res.send({ err: err });
    }
  });
});

//LIST OF THE USERS SPREADSHEETS
app.get('/sheet-list', function(req, res){
  const email = req.session.email;
  db.all('SELECT name, shareable FROM public WHERE email=?', [email], function(err,rows){
    if(!err){
      res.send(rows);
      console.log(rows);
    }
    else{
      res.send({err:err});
      console.log('error');
    }
  });
});

//GET for chart
app.get('/sheet-list', function(req, res) {
  db.all('SELECT name FROM public', [], function( err, rows ) {
          if ( !err ) {
              const names = rows.map( (x) => x.name );
              res.send( names );
              console.log('works');
          }
          else {
              res.send( {err:err} );
          }
      }
  );
});

//Export CSV
app.put( '/csv-export', jsonParser, (req,res) => {
  const values = req.body;
  console.log( 'csv sheet', values );
  let csv = '';
  for( let row of values ) {
      csv += CSV.stringify( row ); 
  }
  res.set('Content-Type', 'text/plain')
  res.send( csv );
});

//Export CSV get
app.get( '/csv-export/:name', (req,res) => {
  const name = req.params.name;
  db.get('SELECT sheet FROM public where name = ?', [name],
      function( err, row ) {
          if ( !err ) {
              // convert to javascript object
              let values = JSON.parse( row.sheet );
              let csv = ''
              for( let row of values ) {
                  csv += CSV.stringify( row ); 
              }
              res.set('Content-Type', 'text/plain')
              // tell the browsers to down load to a file
              res.set('Content-Disposition',
                  `attachment; filename="${name}.csv"`);
              res.send( csv );
          }
          else {
              res.status(404).send("not found");
          }
      }
  );
});

//DELETE NAMED SHEET
app.delete("/sheet/:name", jsonParser, function (req, res, next) {
  let name = req.params.name;
  db.run('DELETE FROM public WHERE name=?', [name], function (err) {
    if (!err) {
      res.send({ ok: true });
    } else {
      console.log(err);
    }
  });
});

//ADMIN DELETE
app.delete("/sheets/:email", jsonParser, function (req, res) {
  let email = req.params.email;
  let name = req.body.name;
  console.log("req", name);
  db.run('DELETE FROM public WHERE name = ?', [name], function (err) {
    if (!err) {
      res.send({ status: "deleted" });
    } else {
      res.send({ error: err });
    }
  });
});

//Import CSV
// app.put( '/csv-import/:name', textBody, (req,res) => {
//   const name = req.params.name;
//   const sheet = [];
//   console.log('importing', req.body);
//   // parse the CSV
//   CSV.forEach(req.body, ',', function(row, index) {
//       sheet.push( row );
//   });
//   const strValues = JSON.stringify( sheet );
//   // insert it into the data base
//   db.run(`INSERT OR REPLACE INTO public (name,sheet) VALUES(?,?)`,
//       [name,strValues],
//       function(err) {
//           if (!err) {
//               res.send( {ok:true} ); // converts to JSON
//           }
//           else {
//               res.send( {ok:false} ); // converts to JSON
//           }
//       }
//   );
// });


app.get('/users', admin, function(req, res) {
  non_admins( req, res )
});

app.post('/logout', function(req,res){
    req.session.email = null;
    req.session.pwd = null;
    req.session.admin = null;
    req.session.firstName = null;
    req.session.lastName = null;
    req.session.login = false;
    res.redirect('/');
});

//REDIRECT TO Account Details PAGE
app.get('/account-details', logged, function (req, res) {
  res.type('.html');
  res.render('account-details', {
      sess: req.session,
      title: 'Status',
      req : req
  })
});

//REDIRECT TO CREATE SPREADSHEETS PAGE
app.get('/spreadsheets', logged, function(req, res) {
  res.type('.html');
  res.render('spreadsheets',{
      sess: req.session,
      title: 'Status',
      req: req
  })
});

//REDIRECT TO CREATE CHARTS PAGE
app.get('/charts', logged, function(req, res) {
  res.type('.html');
  res.render('charts',{
      sess: req.session,
      title: 'Status',
      req: req
  })
});

//REDIRECT TO PUBLIC PAGE
app.get('/public', logged, function(req, res) {
  res.type('.html');
  res.render('public',{
      sess: req.session,
      title: 'Status',
      req: req
  })
});

//REDIRECT TO LOGOUT PAGE
app.get('/logout', function(req,res) {
  req.session.login = false;
  console.log('logout', req.session.login);
  res.redirect('/');
});

app.put('/updatePassword', jsonParser, function(req,res) {
  let change = req.body;
  console.log(change)
  let newPassword = sha256(change.newPassword);
  let email = req.session.email;
  db.run('UPDATE users SET password=? WHERE email=?',
      [newPassword, email],
      function (err) {
          if (!err) {
              res.send( {status: "Successful"})
          }
          else {
              res.send(err);
          }
      }
  )
});

app.put('/update-user', jsonParser, function(req,res) {
  let email = req.body.email;
  let pass = sha256(req.body.passwd);
  let firstname = req.body.firstname;
  let lastname = req.body.lastname;
  db.run(`UPDATE users SET password=?, firstName=?, lastName=? WHERE email=?`,
          [pass,firstname,lastname,email], function(err) {
              if(!err) {
                  res.send({ status : 'successful'})
              }
              else {
                  res.send({ status : "failed"})
              }
      })
});


app.put('/user/:email', jsonParser, function(req, res) {
  let email = req.params.email;
  const user = req.body; // XXX more error checking
  console.log( 'update', user );
  db.run('UPDATE users SET password=?, firstName=?, lastName=? WHERE email=?',
      [sha256(user.passwd), user.firstName, user.lastName, email], function(err) {
      if (!err) {
          res.send( {email : email, status : 'updated'} );
      }
      else {
          res.send( {email : email, error : err} );
      }
  });
});


app.listen(port, () => console.log(`Listening on port ${port}!`));

