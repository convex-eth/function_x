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

    //deploy
    let voteproxy = await FxnVoterProxy.at(contractList.system.voteProxy);
    let cvxfxn = await cvxFxnToken.at(contractList.system.cvxFxn);
    let fxndeposit = await FxnDepositor.at(contractList.system.fxnDepositor);
    let oldbooster = await Booster.at(await voteproxy.operator());
    let staking = await cvxFxnStaking.at(contractList.system.cvxFxnStaking);
    let stakingFeeReceiver = await FeeReceiverCvxFxn.at(contractList.system.cvxFxnStakingFeeReceiver);
    let feeQueue = await FeeDepositV2.at(contractList.system.vefxnRewardQueue);

    await setNoGas();
    let feeReg = await FeeRegistry.new({from:deployer});
    let poolReg = await PoolRegistry.new({from:deployer});
    let poolRewards = await MultiRewards.new(poolReg.address, {from:deployer});
    let vault_erc = await StakingProxyERC20.new(poolReg.address, feeReg.address, contractList.fxn.tokenMinter, {from:deployer});
    let vault_rebalance = await StakingProxyRebalancePool.new(poolReg.address, feeReg.address, contractList.fxn.tokenMinter, {from:deployer});
    let booster = await Booster.new(voteproxy.address, fxndeposit.address, cvxfxn.address, poolReg.address, feeReg.address, {from:deployer} );
    let poolFeeQueue = await FeeDepositV2.new(contractList.system.voteProxy, contractList.system.cvxFxn, contractList.system.cvxFxnStakingFeeReceiver, {from:deployer});
    let poolUtil = await PoolUtilities.new(poolReg.address, {from:deployer});
    contractList.system.booster = booster.address;
    contractList.system.feeReg = feeReg.address;
    contractList.system.poolReg = poolReg.address;
    contractList.system.poolRewards = poolRewards.address;
    contractList.system.vault_erc = vault_erc.address;
    contractList.system.vault_rebalance = vault_rebalance.address;
    contractList.system.poolUtility = poolUtil.address;
    jsonfile.writeFileSync("./contracts.json", contractList, { spaces: 4 });
    console.log(contractList.system);

    console.log("deployed");

    console.log("old booster at: " +oldbooster.address);
    await oldbooster.isShutdown().then(a=>console.log("old is shutdown? " +a));
    await oldbooster.shutdownSystem({from:multisig,gasPrice:0});
    await oldbooster.isShutdown().then(a=>console.log("old is shutdown? " +a));
    await voteproxy.operator().then(a=>console.log("current operator: " +a));
    await voteproxy.setOperator(booster.address,{from:multisig,gasPrice:0})
    await voteproxy.operator().then(a=>console.log("current operator: " +a));
   
    await setNoGas();
    await booster.setFeeToken(contractList.fxn.feeToken, contractList.fxn.vefxnRewardDistro, {from:deployer,gasPrice:0});
    await booster.setFeeQueue(feeQueue.address,{from:deployer,gasPrice:0});
    await setNoGas();
    await booster.claimOperatorRoles({from:deployer,gasPrice:0});
    await booster.setPoolRewardImplementation(poolRewards.address,{from:deployer,gasPrice:0});
    await booster.setPoolFeeDeposit(poolFeeQueue.address,{from:deployer,gasPrice:0});

    await setNoGas();
    await booster.setPendingOwner(multisig,{from:deployer});
    await setNoGas();
    await booster.acceptPendingOwner({from:multisig,gasPrice:0});
    console.log("set new booster as operator");


    console.log("\n\ncreate new pool...");
    let gauge = await IFxnGauge.at("0xc6dEe5913e010895F3702bc43a40d661B13a40BD");
    let gaugeB = await IFxnGauge.at("0xB87A8332dFb1C76Bb22477dCfEdDeB69865cA9f9");
    let staketoken = await IERC20.at("0x53805A76E1f5ebbFE7115F16f9c87C2f7e633726");

    console.log("stake token: " +staketoken.address);
    console.log("gauge address: " +gauge.address);
    console.log("gauge addressB: " +gaugeB.address);

    await setNoGas();
    var tx = await booster.addPool(vault_rebalance.address, gauge.address, staketoken.address,{from:deployer,gasPrice:0});
    console.log("pool added, gas: " +tx.receipt.gasUsed);
    var tx = await booster.addPool(vault_rebalance.address, gaugeB.address, staketoken.address,{from:deployer,gasPrice:0});
    console.log("pool added, gas: " +tx.receipt.gasUsed);

    var poolid = Number(await poolReg.poolLength()) - 1;
    console.log("new pool count: " +(poolid+1));

    var poolinfo = await poolReg.poolInfo(poolid-1);
    console.log(poolinfo);
    var poolinfo = await poolReg.poolInfo(poolid);
    console.log(poolinfo);


    console.log("transfer stake tokens to actingUser...");
    let holder = "0xc6dEe5913e010895F3702bc43a40d661B13a40BD";
    let depositAmount = "10.0"
    await unlockAccount(holder);
    await setNoGas();
    await staketoken.transfer(actingUser, web3.utils.toWei(depositAmount, "ether"),{from:holder,gasPrice:0});
    var tokenBalance = await staketoken.balanceOf(actingUser);
    console.log("tokenBalance: " +tokenBalance);


    console.log("\n\ncheck reward rates...");

    let wsteth = await IERC20.at("0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0");

    console.log("before reward deposit -> ")
    await poolUtil.rebalancePoolRewardRates(gauge.address).then(a=>console.log(JSON.stringify(a)));

    var rewardmanager = "0x79c5f5b0753acE25ecdBdA4c2Bc86Ab074B6c2Bb";
    await unlockAccount(rewardmanager);
    var fxnholder = "0x2290eeFEa24A6E43b26C27187742bD1FEDC10BDB";
    await unlockAccount(fxnholder);

    //get fxn tokens
    await setNoGas();
    await fxn.transfer(rewardmanager, web3.utils.toWei("1000", "ether"),{from:fxnholder,gasPrice:0});
    console.log("fxn tokens transfered to manager");

    await setNoGas();
    await fxn.approve(gauge.address, web3.utils.toWei("1000000000.0","ether"),{from:rewardmanager,gasPrice:0});
    console.log("approved rewards")

    await setNoGas();
    await gauge.depositReward(fxn.address, web3.utils.toWei("500.0","ether"),{from:rewardmanager,gasPrice:0} );
    console.log("rewards deposited on A");

    await setNoGas();
    await fxn.approve(gaugeB.address, web3.utils.toWei("1000000000.0","ether"),{from:rewardmanager,gasPrice:0});
    console.log("approved rewards")

    await setNoGas();
    await gaugeB.depositReward(fxn.address, web3.utils.toWei("500.0","ether"),{from:rewardmanager,gasPrice:0} );
    console.log("rewards deposited on B");

    console.log("check new reward rates -> ")
    await gauge.rewardData(fxn.address).then(a=>console.log("from gauge, fxn data: " +JSON.stringify(a)));
    await poolUtil.rebalancePoolRewardRates(gauge.address).then(a=>console.log(JSON.stringify(a)));
    await poolUtil.getRebalancePoolBoostRatio(gauge.address).then(a=>console.log("boost rate from util: " +a))

    await poolUtil.poolRewardRatesById(poolid-1).then(a=>console.log("rates pool A: " +JSON.stringify(a)));
    await poolUtil.poolRewardRatesById(poolid).then(a=>console.log("rates pool B: " +JSON.stringify(a)));
    
  });
});


