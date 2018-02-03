import Web3 from 'web3';

let web3;

function initWeb3() {
  web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
  console.log('Web3 version :' + web3.version);
}

export {web3, initWeb3};
