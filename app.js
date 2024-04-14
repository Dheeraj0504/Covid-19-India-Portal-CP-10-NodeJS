const express = require('express');
const path = require('path');

const {open} = require('sqlite');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
const databasePath = path.join(__dirname, 'covid19IndiaPortal.db');

let database = null;

const initilizeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/');
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
}
initilizeDbAndServer();

//State Table
const convertStateDbObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
};

//District Table
const convertDistrictDbObjectToResponseObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
};

//API 1: User Login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body;
  const checkUserQuery = `
    SELECT  
      *
    FROM
      user
    WHERE
      username = '${username}';
  `;
  const databaseUser = await database.get(checkUserQuery);

  if (databaseUser === undefined) {
    //Scenario 1:If an unregistered user tries to login
    response.status(400);
    response.send('Invalid user');
  } 
  else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password,
    )
    if (isPasswordMatched === true) {
      //Scenario 3:Successful login of the user
      const payload = {username: username};
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN');
      response.send({jwtToken});
    } 
    else {
      // Scenario 2:If the user provides an incorrect password
      response.status(400);
      response.send('Invalid password');
    }
  }
});

// Authentication with Token
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers['authorization'];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1];
  }
  if (jwtToken === undefined) {
    // Scenario 1:If the token is not provided by the user or an invalid token
    response.status(401);
    response.send('Invalid JWT Token');
  } 
  else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', (error, payload) => {
      if (error) {
        response.status(401);
        response.send('Invalid JWT Token');
      } 
      else {
        //Scenario 2:After successful verification of token proceed to next middleware or handler
        next();
      }
    })
  }
};

//API 2: Returns a list of all states in the state table
app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT 
      *
    FROM 
      state;
  `;
  const statesArray = await database.all(getStatesQuery);
  response.send(statesArray.map(eachState =>
      convertStateDbObjectToResponseObject(eachState),
    ),
  );
});

// API 3: Returns a state based on the state ID
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params;
  const getStateQuery = `
    SELECT 
      *
    FROM
      state
    WHERE 
      state_id = ${stateId};
  `;
  const state = await database.get(getStateQuery);
  response.send(convertStateDbObjectToResponseObject(state));
});

// API 4: Create a district in the district table
app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body;
  const createDistrictQuery = `
    INSERT INTO
      district (district_name, state_id, cases, cured, active, deaths)
    VALUES 
      (
        "${districtName}",
        ${stateId},
        "${cases}",
        "${cured}",
        "${active}",
        "${deaths}"
      );
  `;
  const disctrict = await database.run(createDistrictQuery);
  // console.log(disctrict);
  response.send('District Successfully Added');
});

//API 5: Returns a district based on the district ID
app.get('/districts/:districtId/', authenticateToken,  async (request, response) => {
  const {districtId} = request.params
  const getDistrictQuery = `
    SELECT
      *
    FROM
      district
    WHERE 
      district_id = ${districtId};
  `;
  const district = await database.get(getDistrictQuery);
  response.send(convertDistrictDbObjectToResponseObject(district));  
});

//API 6:Deletes a district from the district table based on the district ID
app.delete('/districts/:districtId/', authenticateToken, async (request, response) => {
  const {districtId} = request.params;
  const deleteDistrictQuery = `
    DELETE FROM
      district
    WHERE 
      district_id = ${districtId};
  `;
  const deletedDistrict = await database.run(deleteDistrictQuery);
  //console.log(deletedDistrict);
  response.send('District Removed');
});

//API 7:Updates the details of a specific district based on the district ID
app.put('/districts/:districtId/', authenticateToken, async (request, response) => {
  const {districtId} = request.params;
  const {districtName, stateId, cases, cured, active, deaths} = request.body;
  const updateDistrictQuery = `
    UPDATE
      district
    SET
      district_name = '${districtName}',
      state_id = ${stateId},
      cases = ${cases},
      cured = ${cured},
      active = ${active}, 
      deaths = ${deaths}
    WHERE
      district_id = ${districtId};
  `;
  const updatedDistrict = await database.run(updateDistrictQuery);
  // console.log(updatedDistrict);
  response.send('District Details Updated');
});

//API 8: Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID
app.get('/states/:stateId/stats/', authenticateToken, async (requeat, response) => {
  const {stateId} = requeat.params;
  const getStateStatisticsQuery = `
    SELECT
      SUM(cases),
      SUM(cured),
      SUM(active),
      SUM(deaths)
    FROM
      district
    WHERE
      state_id=${stateId};
  `;
  const statistics = await database.get(getStateStatisticsQuery);
  response.send({
    totalCases: statistics['SUM(cases)'],
    totalCured: statistics['SUM(cured)'],
    totalActive: statistics['SUM(active)'],
    totalDeaths: statistics['SUM(deaths)'],
  });
});
module.exports = app;


//Returns a list of all districts in the district table
app.get('/districts/', async (request, response) => {
  const getDistrictsQuery = `
    SELECT 
      *
    FROM
      district;    
  `;
  const districtsArray = await database.all(getDistrictsQuery)
  response.send(
    districtsArray.map(eachdistrict =>
      convertDistrictDbObjectToResponseObject(eachdistrict),
    ),
  );
});

//Returns a list of all users in the user table
app.get('/users/', async (request, response) => {
  const getUsersQuery = `
    SELECT
      *
    FROM
      user;
  `;
  const usersDetails = await database.all(getUsersQuery);
  response.send(usersDetails);
});


