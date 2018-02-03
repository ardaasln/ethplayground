import async from 'async';
import app from '../app';
import * as dbManag from '../db/dbmanagement';
import * as web3Manag from './web3management';
import request from 'request';
import _ from 'lodash';

let latestBlockNumberInDb;

function resendTxnForInternalTxns(txnHash) {
  let url = 'https://api.etherscan.io/api?module=account&action=txlistinternal&txhash=' + txnHash + '&apikey=47CIQTCQR7P8BBKYJ8G1EKGHN92QA8HRYC';
  request(url, (err, response, body) => {
    if (err) {
      console.log(err);
    }
    if (response.statusCode === 200) {
      processInternalTransactions(body);
      let index = unprocessedTxns.indexOf(txnHash);
      unprocessedTxns.splice(index, 1);
    } else {
      console.log('Getting ' + response.statusCode + ' when processing an unprocessed transaction for internal transaction fetching');
      unprocessedTxns.push(txn.hash);
    }
  });
}

function processInternalTransactions(transactionBody) {
  let parsedResult = transactionBody.result;

  if (_.isNil(parsedResult) || _.isEmpty(parsedResult)) {
    console.log('No Internal Transactions');
  } else {
    for (i = 0; i < parsedResult.length; i++) {
      let isErroneous = parsedResult[i].isError;
      let errCode = parsedResult[i].errCode;
      let internalFromId = parsedResult[i].from;
      let internalToId = parsedResult[i].to;
      let createdContractId = parsedResult[i].contractAddress;
      let type = parsedResult[i].type;
      let value = parsedResult[i].value;
      let blockNumber = parsedResult[i].blockNumber;
      let gas = parsedResult[i].gas;
      let gasUsed = parsedResult[i].gasUsed;


      let properties = {type: type,
        amount: value/parseFloat(1.0E+18),
        isErroneous: isErroneous,
        errCode: errCode,
        blockNumber: blockNumber,
        gas: gas,
        gasUsed: gasUsed};

      app.async.series([
        (res) => {
          console.log('Internal transaction type = ' + type);
          if (type === 'call') {
            app.async.series([
              (res) => {
                dbManag.createAddress(internalToId, 0, res); // It might also be a contract but if so it should have been created previously
              },
              (res) => {
                dbManag.createInternalTransaction(internalFromId, internalToId, properties, res);
              },
            ]);
          } else if (type === 'create') {
            app.async.series([
              (res) => {
                dbManag.createAddress(createdContractId, 1, res);
              },
              (res) => {
                dbManag.createInternalTransaction(internalFromId, createdContractId, properties, res);
              },
            ]);
          } else {
            return res();
          }
        },
      ]);
    }
  }
}

function processBlock(blockNumber, callback) {
  let blockFetched;
  let txn;
  let contractAddress;
  let gasUsed;
  let cumulativeGasUsed;
  let fromId;
  let toId;
  let unprocessedTxns = [];

  async.series([
    (res) => {
      let blockPromise = web3Manag.web3.eth.getBlock(blockNumber);
      blockPromise.then((block) => {
        blockFetched = block;
        console.log('Fetched Block No: ' + blockFetched.number);
        return res();
      }).catch((err) => {
        console.log('Error while getting block: ' + err);
        return res();
      });
    },
    (res) => {
      if (blockFetched.transactions.length) {
        let transactionArray = [];
        for (let m = 0; m < blockFetched.transactions.length; m++) {
          transactionArray[m] = m;
        }
        console.log('Length Of Block: ' + blockFetched.number + 's Transaction List: ' + blockFetched.transactions.length);
        async.eachSeries(transactionArray, (number, cb) => {
          async.waterfall([
            (res) => {
              let promiseReceipt = web3Manag.web3.eth.getTransactionReceipt(blockFetched.transactions[number]);
              promiseReceipt.then((result) => {
                contractAddress = result.contractAddress;
                gasUsed = result.gasUsed;
                cumulativeGasUsed = result.cumulativeGasUsed;
                return res();
              }).catch((error) => {
                console.log(error);
                return res();
              });
            },
            (res) => {
              let promiseTxn = web3Manag.web3.eth.getTransaction(blockFetched.transactions[number]);
              promiseTxn.then((result) => {
                txn = result;
                return res();
              }).catch((error) => {
                console.log(error);
                return res();
              });
            },
            (res) => {
              dbManag.createAddress(txn.from, 0, res);
            },
            (id, res) => {
              fromId = id;
              // Contract creation
              if (txn.to === null) {
                dbManag.createAddress(contractAddress, 1, res);
              } else {
                dbManag.createAddress(txn.to, 0, res);
              }
            },
            (id, res) => {
              toId = id;
              console.log('Transaction Hash: ' + txn.hash);
              let properties = {key: txn.hash,
                amount: txn.value/parseFloat(1.0E+18),
                nonce: txn.nonce,
                blockNumber: txn.blockNumber,
                gasPrice: txn.gasPrice/parseFloat(1.0E+18),
                gas: txn.gas,
                gasUsed: gasUsed,
                cumulativeGasUsed: cumulativeGasUsed,
                input: txn.input};
              dbManag.createTransaction(fromId, toId, properties, res);
            },
            (res) => {
              let url = 'https://api.etherscan.io/api?module=account&action=txlistinternal&txhash=' + txn.hash + '&apikey=47CIQTCQR7P8BBKYJ8G1EKGHN92QA8HRYC';
              request(url, (err, response, body) => {
                if (err) {
                  console.log(err);
                }
                if (response.statusCode === 200) {
                  processInternalTransactions(body);
                  for (let m = 0; m < unprocessedTxns.length; m++) {
                    resendTxnForInternalTxns(unprocessedTxns[m]);
                  }
                  return res();
                } else {
                  unprocessedTxns.push(txn.hash);
                  return res();
                }
              });
            },
          ], (err, res) => {
            return cb();
          });
        }, (eachSeriesError) => {
          return res();
        });
      } else {
        console.log('No txns in block ' + blockFetched.number);
        latestBlockNumberInDb++;
        return res();
      }
    },
  ], (res) => {
    return callback();
  });
}

function explore() {
  let endOfLoop;
  async.waterfall([
    (res) => {
      dbManag.getLatestBlockNumberInDb(res);
    },
    (blockNumber, res) => {
      latestBlockNumberInDb = blockNumber;
      web3Manag.web3.eth.isSyncing()
        .then((result) => {
          endOfLoop = result.currentBlock;
          return res();
        });
    },
    (res) => {
      latestBlockNumberInDb = 46000;
      let blockNumberArray = [];
      for (let j = latestBlockNumberInDb; j < endOfLoop; j++) {
        blockNumberArray[j - latestBlockNumberInDb] = j;
      }
      console.log('End of loop = ' + endOfLoop);
      async.eachSeries(blockNumberArray, processBlock, (err) => {
        if (err) {
          console.log(err);
        }
        console.log('All blocks have been processed successfully');
        latestBlockNumberInDb = endOfLoop;
        return res();
      });
    },
    (res) => {
      dbManag.setLatestBlockNumber(latestBlockNumberInDb, res);
    },
  ], (err, res) => {
    if (err) {
      console.log(err);
    }
    console.log('ALL IS WELL');
  });
}

export {explore};
