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
    let poolFeeQueue = await FeeDepositV2.new(contractList.system.voteProxy, contractList.system.cvxFxn, contractList.system.cvxFxnStakingFeeReceiver, addressZero, {from:deployer});
    let poolUtil = await PoolUtilities.new(poolReg.address, {from:deployer});
    contractList.system.booster = booster.address;
    contractList.system.feeReg = feeReg.address;
    contractList.system.poolReg = poolReg.address;
    contractList.system.poolRewards = poolRewards.address;
    contractList.system.vault_erc = vault_erc.address;
    contractList.system.vault_rebalance = vault_rebalance.address;
    contractList.system.poolUtility = poolUtil.address;
    // jsonfile.writeFileSync("./contracts.json", contractList, { spaces: 4 });
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


    await advanceTime(day);

    console.log("\n\ncreate new pool...");
    let pool = "0xd6982da59F1D26476E259559508f4135135cf9b8";
    let lptoken = await IERC20.at("0xd6982da59F1D26476E259559508f4135135cf9b8");
    let gauge = await IFxnGauge.at("0xeD113B925AC3f972161Be012cdFEE33470040E6a");

    console.log("pool token: " +lptoken.address);
    console.log("gauge address: " +gauge.address);

    var controller = await IGaugeController.at(contractList.fxn.gaugeController);
    // var controllerAdmin = await controller.admin();
    // await unlockAccount(controllerAdmin);
    // await controller.add_type("testtype",web3.utils.toWei("1.0","ether"),{from:controllerAdmin,gasPrice:0});
    // await controller.add_gauge(gauge.address,0,web3.utils.toWei("1.0","ether"),{from:controllerAdmin,gasPrice:0});
    // console.log("gauge added to controller");
    await controller.gauge_relative_weight(gauge.address).then(a=>console.log("gauge rel weight: " +a))

    var tx = await booster.addPool(vault_erc.address, gauge.address, await gauge.stakingToken(),{from:deployer,gasPrice:0});
    console.log("pool added, gas: " +tx.receipt.gasUsed);
    var poolid = Number(await poolReg.poolLength()) - 1;
    console.log("new pool count: " +(poolid+1));

    var poolinfo = await poolReg.poolInfo(poolid);
    console.log(poolinfo);


    console.log("transfer lp tokens to actingUser...");
    let holder = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F";
    let depositAmount = "1000.0"
    await unlockAccount(holder);
    await lptoken.transfer(actingUser, web3.utils.toWei(depositAmount, "ether"),{from:holder,gasPrice:0});
    var tokenBalance = await lptoken.balanceOf(actingUser);
    console.log("tokenBalance: " +tokenBalance);


    console.log("\n\nstake to new pool...");

    //create vault
    var tx = await booster.createVault(poolid,{from:actingUser});
    console.log("created vault: gas = " +tx.receipt.gasUsed);
    
    //get vault
    let vaultAddress = await poolReg.vaultMap(poolid,actingUser);
    let vault = await StakingProxyERC20.at(vaultAddress)
    console.log("vault at " +vault.address);// +", gas: " +tx.receipt.gasUsed);

    await vault.gaugeAddress().then(a=>console.log("vault.gaugeAddress() " +a))
    await vault.stakingToken().then(a=>console.log("vault.stakingToken() " +a))
    await vault.rewards().then(a=>console.log("vault.rewards() " +a))
    
    var poolrewards = await MultiRewards.at(await vault.rewards());
    console.log("extra rewards at: " +poolrewards.address)
    await poolrewards.rewardState().then(a=>console.log("reward state? " +a));

    await poolUtil.poolBoostRatioById(poolid).then(a=>console.log("boost rate from util: " +a));

    await lptoken.approve(vault.address, web3.utils.toWei("1000000000.0","ether"),{from:actingUser});
    console.log("approved");
    // var tx = await vault.deposit(web3.utils.toWei(depositAmount,"ether"), {from:actingUser});
    var tx = await vault.methods['deposit(uint256,bool)'](web3.utils.toWei(depositAmount,"ether"), false, {from:actingUser});
    console.log("staked, gas: " +tx.receipt.gasUsed);

    await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    tokenBalance = await lptoken.balanceOf(actingUser);
    console.log("tokenBalance: " +tokenBalance);

    await gauge.workingBalanceOf(vault.address).then(a=>console.log("workingBalanceOf vault: " +a));
    await gauge.sharedBalanceOf(vault.address).then(a=>console.log("sharedBalanceOf vault: " +a));
    await gauge.workingBalanceOf(voteproxy.address).then(a=>console.log("workingBalanceOf voteproxy: " +a));
    await gauge.sharedBalanceOf(voteproxy.address).then(a=>console.log("sharedBalanceOf voteproxy: " +a));
    await poolUtil.gaugeWorkingBalance(gauge.address).then(a=>console.log("working balance via pool util: " +a));
    await poolUtil.poolBoostRatioById(poolid).then(a=>console.log("boost rate from util: " +a));

    console.log("check reward rates...");
    await poolUtil.gaugeRewardRates(gauge.address).then(a=>console.log(JSON.stringify(a)));

    await gauge.getActiveRewardTokens().then(a=>console.log("active rewards: " +JSON.stringify(a)));
    await vault.earned.call().then(a=>console.log("earned: " +JSON.stringify(a)));

    await fxn.balanceOf(actingUser).then(a=>console.log("balance of fxn: " +a))
    await fxn.balanceOf(poolFeeQueue.address).then(a=>console.log("balance of fxn feeQueue: " +a))
    await cvx.balanceOf(actingUser).then(a=>console.log("balance of cvx: " +a))

    await vault.getReward();
    console.log("rewards claimed");

    await fxn.balanceOf(actingUser).then(a=>console.log("balance of fxn: " +a))
    await fxn.balanceOf(poolFeeQueue.address).then(a=>console.log("balance of fxn feeQueue: " +a))
    await cvx.balanceOf(actingUser).then(a=>console.log("balance of cvx: " +a))


    console.log("withdraw...");

    tokenBalance = await lptoken.balanceOf(actingUser);
    await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    console.log("tokenBalance before: " +tokenBalance);

    await vault.withdraw(web3.utils.toWei(depositAmount,"ether"),{from:actingUser});
    console.log("withdraw complete");

    await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    tokenBalance = await lptoken.balanceOf(actingUser);
    console.log("tokenBalance after: " +tokenBalance);
    

    console.log("check reward rates when no supply...");
    await poolUtil.gaugeRewardRates(gauge.address).then(a=>console.log(JSON.stringify(a)));
    console.log("---")
    await poolUtil.poolRewardRatesById(poolid).then(a=>console.log(JSON.stringify(a)));
    console.log("done");
    
  });
});


