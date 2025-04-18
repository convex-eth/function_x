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
const PoolUtilities = artifacts.require("PoolUtilities");


const IERC20 = artifacts.require("IERC20");
const IGaugeController = artifacts.require("IGaugeController");


const addAccount = async (address) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_addAccount",
        params: [address, "passphrase"],
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

const unlockAccount = async (address) => {
  await addAccount(address);
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "personal_unlockAccount",
        params: [address, "passphrase"],
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
      await time.increase(secondsElaspse);
      await time.advanceBlock();
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


    let feeReg = await FeeRegistry.new({from:deployer});
    let poolReg = await PoolRegistry.new({from:deployer});
    let poolRewards = await MultiRewards.new(poolReg.address, {from:deployer});
    let vault_erc = await StakingProxyERC20.new(poolReg.address, feeReg.address, contractList.fxn.tokenMinter, {from:deployer});
    let booster = await Booster.new(voteproxy.address, fxndeposit.address, cvxfxn.address, poolReg.address, feeReg.address, {from:deployer} );
    let poolFeeQueue = await FeeDepositV2.new(contractList.system.voteProxy, contractList.system.cvxFxn, contractList.system.cvxFxnStakingFeeReceiver, {from:deployer});
    let poolUtil = await PoolUtilities.new(poolReg.address, {from:deployer});
    contractList.system.booster = booster.address;
    contractList.system.feeReg = feeReg.address;
    contractList.system.poolReg = poolReg.address;
    contractList.system.poolRewards = poolRewards.address;
    contractList.system.vault_erc = vault_erc.address;
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
   
    await booster.setFeeToken(contractList.fxn.feeToken, contractList.fxn.vefxnRewardDistro, {from:deployer,gasPrice:0});
    await booster.setFeeQueue(feeQueue.address,{from:deployer,gasPrice:0});

    await booster.claimOperatorRoles({from:deployer,gasPrice:0});
    await booster.setPoolRewardImplementation(poolRewards.address,{from:deployer,gasPrice:0});
    await booster.setPoolFeeDeposit(poolFeeQueue.address,{from:deployer,gasPrice:0});

    await booster.setPendingOwner(multisig,{from:deployer});
    await booster.acceptPendingOwner({from:multisig,gasPrice:0});
    console.log("set new booster as operator");


    console.log("\n\ncreate new pool...");
    let pool = "0xc15f285679a1ef2d25f53d4cbd0265e1d02f2a92";
    let lptoken = await IERC20.at("0xE06A65e09Ae18096B99770A809BA175FA05960e2");
    let gauge = await MockGauge.new(lptoken.address,{from:deployer});

    console.log("pool token: " +lptoken.address);
    console.log("gauge address: " +gauge.address);

    var controller = await IGaugeController.at(contractList.fxn.gaugeController);
    var controllerAdmin = await controller.admin();
    await unlockAccount(controllerAdmin);
    await controller.add_type("testtype",web3.utils.toWei("1.0","ether"),{from:controllerAdmin,gasPrice:0});
    await controller.add_gauge(gauge.address,0,web3.utils.toWei("1.0","ether"),{from:controllerAdmin,gasPrice:0});
    console.log("gauge added to controller");
    await controller.gauge_relative_weight(gauge.address).then(a=>console.log("gauge rel weight: " +a))

    var tx = await booster.addPool(vault_erc.address, gauge.address, lptoken.address,{from:deployer,gasPrice:0});
    console.log("pool added, gas: " +tx.receipt.gasUsed);
    var poolid = Number(await poolReg.poolLength()) - 1;
    console.log("new pool count: " +(poolid+1));

    var poolinfo = await poolReg.poolInfo(poolid);
    console.log(poolinfo);

    console.log("transfer lp tokens to actingUser...");
    let holder = "0xf42e2b73ea79812a7c3e4ba8ed052c523765719f";
    let depositAmount = "10.0"
    await unlockAccount(holder);
    await lptoken.transfer(actingUser, web3.utils.toWei(depositAmount, "ether"),{from:holder,gasPrice:0});
    var tokenBalance = await lptoken.balanceOf(actingUser);
    console.log("tokenBalance: " +tokenBalance);

    console.log("reward rates:");
    await poolUtil.poolRewardRates(gauge.address).then(a=>console.log(JSON.stringify(a)));

    console.log("done");
    
  });
});


