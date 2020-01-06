//use express module
const express = require('express');
//use bodyParser middleware
const bodyParser = require('body-parser');
//use mysql database
const mysql = require('mysql');
const app = express();
 
//Create connection
const conn = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'User'
});
 
//connect to database
conn.connect((err) =>{
  if(err) throw err;
  console.log('Mysql Connected...');
});
//parse the request body
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

//for getting the user data
app.get('/',(req, res) => {
  let sql = "SELECT * FROM user_details";
  let query = conn.query(sql, (err, results) => {
    if(err) throw err;
    res.send(results)
  });
});
 
// for inserting data
app.post('/save',(req, res) => {
  let data = {name: req.body.name, email: req.body.email,phone:req.body.phone,address: req.body.address};
  let sql = "INSERT INTO user_details SET ?";
  let query = conn.query(sql, data,(err, results) => {
    if(err) throw err;
// here we can redirect it to other view pages and render the results.eg. res.rendirect("/save")
    res.send('success');
  });
});
 
//for updating data
app.post('/update',(req, res) => {
    console.log(req.body.phone);
  let sql = "UPDATE user_details SET phone='"+req.body.phone+"' WHERE name='"+ req.body.name+"'";
  let query = conn.query(sql, (err, results) => {
    if(err) throw err;
    res.send("sucess");
  });
});
 
//for deleting data
app.post('/delete',(req, res) => {
  let sql = "DELETE FROM user_details WHERE name='"+req.body.name+"'";
  let query = conn.query(sql, (err, results) => {
    if(err) throw err;
     res.send("sucess");
  });
});
 
//server listening
app.listen(8000, () => {
  console.log('Server is running at port 8000');
});