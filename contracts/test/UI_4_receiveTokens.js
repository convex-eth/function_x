const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
var contractList = jsonfile.readFileSync('./contracts.json');

const FxnVoterProxy = artifacts.require("FxnVoterProxy");
const Booster = artifacts.require("Booster");
const FeeReceiverCvxFxn = artifacts.require("FeeReceiverCvxFxn");
const FeeDepositV2 = artifacts.require("FeeDepositV2");
const cvxFxnStaking = artifacts.require("cvxFxnStaking");
const FxnDepositor = artifacts.require("FxnDepositor");
const cvxFxnToken = artifacts.require("cvxFxnToken");

const FeeRegistry = artifacts.require("FeeRegistry");
const PoolRegistry = artifacts.require("PoolRegistry");
const MockGauge = artifacts.require("MockGauge");
const MultiRewards = artifacts.require("MultiRewards");
const StakingProxyBase = artifacts.require("StakingProxyBase");
const StakingProxyERC20 = artifacts.require("StakingProxyERC20");
const StakingProxyRebalancePool = artifacts.require("StakingProxyRebalancePool");
const PoolUtilities = artifacts.require("PoolUtilities");


const IFxnGauge = artifacts.require("IFxnGauge");
const IFxClaimer = artifacts.require("IFxClaimer");
const IERC20 = artifacts.require("IERC20");
const IGaugeController = artifacts.require("IGaugeController");


const unlockAccount = async (address) => {
  let NETWORK = config.network;
  if(!NETWORK.includes("debug")){
    return null;
  }
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "hardhat_impersonateAccount",
        params: [address],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const setNoGas = async () => {
  let NETWORK = config.network;
  if(!NETWORK.includes("debug")){
    return null;
  }
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "hardhat_setNextBlockBaseFeePerGas",
        params: ["0x0"],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const send = payload => {
  if (!payload.jsonrpc) payload.jsonrpc = '2.0';
  if (!payload.id) payload.id = new Date().getTime();

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(payload, (error, result) => {
      if (error) return reject(error);

      return resolve(result);
    });
  });
};

/**
 *  Mines a single block in Ganache (evm_mine is non-standard)
 */
const mineBlock = () => send({ method: 'evm_mine' });

/**
 *  Gets the time of the last block.
 */
const currentTime = async () => {
  const { timestamp } = await web3.eth.getBlock('latest');
  return timestamp;
};

/**
 *  Increases the time in the EVM.
 *  @param seconds Number of seconds to increase the time by
 */
const fastForward = async seconds => {
  // It's handy to be able to be able to pass big numbers in as we can just
  // query them from the contract, then send them back. If not changed to
  // a number, this causes much larger fast forwards than expected without error.
  if (BN.isBN(seconds)) seconds = seconds.toNumber();

  // And same with strings.
  if (typeof seconds === 'string') seconds = parseFloat(seconds);

  await send({
    method: 'evm_increaseTime',
    params: [seconds],
  });

  await mineBlock();
};

contract("staking platform", async accounts => {
  it("should successfully run", async () => {
    
    let deployer = contractList.system.deployer;
    let multisig = contractList.system.multisig;
    let addressZero = "0x0000000000000000000000000000000000000000"

    let cvx = await IERC20.at(contractList.system.cvx);
    let fxn = await IERC20.at(contractList.fxn.fxn);
    let vefxn = await IERC20.at(contractList.fxn.vefxn);
    let fxusd = await IERC20.at(contractList.fxn.fxusd);
    let sfrxeth = await IERC20.at("0xac3E018457B222d93114458476f3E3416Abbe38F");
    let feth = await IERC20.at("0x53805A76E1f5ebbFE7115F16f9c87C2f7e633726");
    
    let userA = accounts[0];
    let userB = accounts[1];
    let userC = accounts[2];
    let userD = accounts[3];
    let userZ = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F";
    var userNames = {};
    userNames[userA] = "A";
    userNames[userB] = "B";
    userNames[userC] = "C";
    userNames[userD] = "D";
    userNames[userZ] = "Z";

    const advanceTime = async (secondsElaspse) => {
      await fastForward(secondsElaspse);
      console.log("\n  >>>>  advance time " +(secondsElaspse/86400) +" days  >>>>\n");
    }
    const day = 86400;
    await unlockAccount(deployer);
    await unlockAccount(multisig);
    console.log("deploying from " +deployer);
    
    let actingUser = userA
    await unlockAccount(actingUser);

    console.log("transfer feth tokens to actingUser...");
    var holder = "0xc6dEe5913e010895F3702bc43a40d661B13a40BD";
    let depositAmount = "10.0"
    await unlockAccount(holder);
    await setNoGas();
    await feth.transfer(actingUser, web3.utils.toWei(depositAmount, "ether"),{from:holder,gasPrice:0});
    var tokenBalance = await feth.balanceOf(actingUser);
    console.log("feth Balance: " +tokenBalance);

    console.log("transfer fxusd to actingUser...");
    var holder = "0xe6b953BB4c4B8eEd78b40B81e457ee4BDA461D55";
    let fxusdAmount = "10000";
    await unlockAccount(holder);
    await setNoGas();
    await fxusd.transfer(actingUser, web3.utils.toWei(fxusdAmount, "ether"),{from:holder,gasPrice:0});
    var fxusdBalance = await fxusd.balanceOf(actingUser);
    console.log("fxusd Balance: " +fxusdBalance);

    console.log("transfer sfrxeth to actingUser...");
    var holder = "0x78bB3aEC3d855431bd9289fD98dA13F9ebB7ef15";
    let sfrxethAmount = "30";
    await unlockAccount(holder);
    await setNoGas();
    await sfrxeth.transfer(actingUser, web3.utils.toWei(sfrxethAmount, "ether"),{from:holder,gasPrice:0});
    var sfrxethBalance = await sfrxeth.balanceOf(actingUser);
    console.log("sfrxeth Balance: " +fxusdBalance);

    console.log("transfer lp tokens to actingUser...");
    let lptoken = await IERC20.at("0x1062fd8ed633c1f080754c19317cb3912810b5e5");
    var holder = "0x724476f141ED2DE4DA22eBDF435905dEf1118317";
    let lpAmount = "1000.0"
    await unlockAccount(holder);
    await lptoken.transfer(actingUser, web3.utils.toWei(lpAmount, "ether"),{from:holder,gasPrice:0});
    var lpBalance = await lptoken.balanceOf(actingUser);
    console.log("lpBalance: " +lpBalance);


    
    console.log("transfer staked fx position actingUser...");
    let stakedtoken = await IERC20.at("0xfEFafB9446d84A9e58a3A2f2DDDd7219E8c94FbB");
    var holder = "0x1389388d01708118b497f59521f6943Be2541bb7";
    let stakedAmount = "100.0"
    await unlockAccount(holder);
    await stakedtoken.transfer(actingUser, web3.utils.toWei(stakedAmount, "ether"),{from:holder,gasPrice:0});
    var stakedBalance = await stakedtoken.balanceOf(actingUser);
    console.log("staked token Balance: " +stakedBalance);
  });
});


