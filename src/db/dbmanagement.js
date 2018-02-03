const neo4j = require('neo4j-driver').v1;

let driver = '';

function initDb() {
  driver = neo4j.driver('bolt://localhost', neo4j.auth.basic('neo4j', 'test'));
}

function setLatestBlockNumber(blockNumber, callback) {
  let session = driver.session();
  let promise1 = session.run('MATCH (latestBlockNumber:LatestBlockNumber) SET latestBlockNumber.blocknumber = ' + blockNumber + ' RETURN latestBlockNumber');
  promise1.then((result) => {
    console.log('Latest block number added to db: ' + latestBlockNumberInDb);
    session.close();
    return callback();
  }).catch((err) => {
    console.log('Error while setting latestBlockNumber');
    console.log(err);
    session.close();
    return callback();
  });
}

function getAddress(key, callback) {
  let session = driver.session();
  let promise1 = session.run('MATCH (addr:Address) WHERE addr.key = "' + key + '" RETURN id(addr)');
  promise1.then((result) => {
    let id = result.records[0]._fields[0]['low'];
    session.close();
    return callback(null, id);
  }).catch((err) => {
    console.log(err);
    console.log('Cannot Get Address');
    session.close();
    return callback();
  });
}

function createAddress(key, isContract, callback) {
  let session = driver.session();
  let promise1 = session.run('CREATE (addr:Address { key:"' + key + '",isContract:"' + isContract + '"}) RETURN id(addr)');
  promise1.then((result) => {
    if (!result) {
      session.close();
      return callback();
    } else {
      session.close();
      console.log('Created Address');
      return callback(null, result.records[0]._fieldLookup['id(addr)']);
    }
  }).catch((err) => {
    console.log('Error While Creating Address');
    session.close();
    return getAddress(key, callback);
  });
}

function createInternalTransaction(fromId, toId, properties, callback) {
  let session = driver.session();
  let promise1 = session.run('MATCH (addrfrom:Address) WHERE addrfrom.key = "' + fromId + '" MATCH (addrto:Address) WHERE addrto.key = "' + toId + '" CREATE (addrfrom)-[relation:InternalTransaction{type:"' + properties.type + '", value:"' + properties.amount + '", isErroneous: "' + properties.isErroneous + '", errCode: "' + properties.errCode + '"}]->(addrto)');
  promise1.then((result) => {
    session.close();
    console.log('Created Internal Transaction');
    return callback();
  }).catch((err) => {
    console.log('Error While Creating An Internal Transaction');
    session.close();
    return callback();
  });
}

function createTransaction(fromId, toId, properties, callback) {
  let session = driver.session();
  let promise1 = session.run('MATCH (addrfrom:Address) WHERE id(addrfrom) = ' + fromId + ' MATCH (addrto:Address) WHERE id(addrto) = ' + toId + ' CREATE (addrfrom)-[relation:Transaction{key:"' + properties.key + '",amount:"' + properties.amount + '",nonce:"' + properties.nonce + '",blockNumber:"' + properties.blockNumber + '",gasPrice:"' + properties.gasPrice + '",gas:"' + properties.gas + '",input:"' + properties.input + '"}]->(addrto)');
  promise1.then((result) => {
    session.close();
    console.log('Created Transaction');
    return callback();
  }).catch((err) => {
    console.log('Error While Creating A Transaction');
    session.close();
    return callback();
  });
}

function getLatestBlockNumberInDb(callback) {
  let session = driver.session();
  let promise1 = session.run('MATCH (latestBlockNumber:LatestBlockNumber) RETURN latestBlockNumber.blocknumber');
  promise1.then((result) => {
    console.log('Fetched Latest Block Number: ' + result.records[0]._fieldLookup['latestBlockNumber.blocknumber']);
    session.close();
    return callback(null, result.records[0]._fieldLookup['latestBlockNumber.blocknumber']);
  }).catch((err) => {
    console.log('Error While Fetching Latest Block Number');
    console.log(err);
    session.close();
    return callback(err);
  });
}

function configureDb() {
  let session = driver.session();
  let promise1 = session.run('CREATE CONSTRAINT ON (addr:Address) ASSERT addr.key IS UNIQUE');
  let promise2 = session.run('CREATE CONSTRAINT ON ()-[txn:Transaction]-() ASSERT txn.key IS UNIQUE');
  let promise3 = session.run('CREATE (latestBlockNumber:LatestBlockNumber { blocknumber:0 })');

  Promise.all([promise1, promise2, promise3]).then((result) => {
    console.log('Configured Db Successfully');
    session.close();
  }).catch((err) => {
    console.log('Problem While Configuring Db');
    session.close();
    console.log(err);
  });
}

export {initDb, configureDb, driver, getLatestBlockNumberInDb, createAddress, createTransaction, setLatestBlockNumber, createInternalTransaction};
