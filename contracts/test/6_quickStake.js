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

    let voteproxy = await FxnVoterProxy.at(contractList.system.voteProxy);
    let cvxfxn = await cvxFxnToken.at(contractList.system.cvxFxn);
    let fxndeposit = await FxnDepositor.at(contractList.system.fxnDepositor);
    let booster = await Booster.at(await voteproxy.operator());
    let staking = await cvxFxnStaking.at(contractList.system.cvxFxnStaking);
    let stakingFeeReceiver = await FeeReceiverCvxFxn.at(contractList.system.cvxFxnStakingFeeReceiver);
    let feeQueue = await FeeDepositV2.at(contractList.system.vefxnRewardQueue);

    let feeReg = await FeeRegistry.at(contractList.system.feeReg);
    let poolReg = await PoolRegistry.at(contractList.system.poolReg);

    var poolid = 25;//Number(await poolReg.poolLength()) - 1;
    var poolinfo = await poolReg.poolInfo(poolid);
    console.log(poolinfo);


    var btcusd = await IERC20.at(contractList.fxn.btcusd);
    var wbtc = await IERC20.at("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599");
    let gauge = await IFxnGauge.at(poolinfo.stakingAddress);
    console.log("transfer fxusd to actingUser...");
    var holder = "0x2A1049062c6Cfd69bd38fbaf3b0559DF1DBbc92c";
    let fxusdAmount = "100";
    await unlockAccount(holder);
    await setNoGas();
    await btcusd.transfer(actingUser, web3.utils.toWei(fxusdAmount, "ether"),{from:holder,gasPrice:0});
    var fxusdBalance = await btcusd.balanceOf(actingUser);
    console.log("btcusd Balance: " +fxusdBalance);

    console.log("\n\nstake to new pool...");

    //create vault
    var tx = await booster.createVault(poolid,{from:actingUser});
    console.log("created vault: gas = " +tx.receipt.gasUsed);
    
    //get vault
    let vaultAddress = await poolReg.vaultMap(poolid,actingUser);
    let vault = await StakingProxyRebalancePool.at(vaultAddress)
    console.log("vault at " +vault.address);// +", gas: " +tx.receipt.gasUsed);

    await vault.gaugeAddress().then(a=>console.log("vault.gaugeAddress() " +a))
    await vault.stakingToken().then(a=>console.log("vault.stakingToken() " +a))
    await vault.rewards().then(a=>console.log("vault.rewards() " +a))
    
    var poolrewards = await MultiRewards.at(await vault.rewards());
    console.log("extra rewards at: " +poolrewards.address)
    await poolrewards.rewardState().then(a=>console.log("reward state? " +a));

    // await feth.approve(vault.address, web3.utils.toWei("1000000000.0","ether"),{from:actingUser});
    await btcusd.approve(vault.address, web3.utils.toWei("1000000000.0","ether"),{from:actingUser});
    // await sfrxeth.approve(vault.address, web3.utils.toWei("1000000000.0","ether"),{from:actingUser});
    console.log("approved");
    await setNoGas();
    await vault.depositFxUsd(web3.utils.toWei(fxusdAmount,"ether"), {from:actingUser}).then(a=>console.log("deposited via fxusd")).catch(a=>console.log("revert deposit fxusd -> " +a));
    // await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    // await sfrxeth.transfer(vault.address, 1234,{from:holder,gasPrice:0}); //transfer a smidge to make sure it is returned
    // await vault.depositBase(web3.utils.toWei(sfrxethAmount,"ether"), 0, {from:actingUser}).then(a=>console.log("deposited via base")).catch(a=>console.log("revert deposit base -> " +a));
    // await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    // var tx = await vault.deposit(web3.utils.toWei(depositAmount,"ether"), {from:actingUser}).then(a=>console.log("deposited via ftoken")).catch(a=>console.log("revert deposit normal -> " +a));
    await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));

    // console.log("staked, gas: " +tx.receipt.gasUsed);
    // await feth.balanceOf(actingUser).then(a=>console.log("feth balance: "+a));
    await btcusd.balanceOf(actingUser).then(a=>console.log("fxusd balance: "+a));
    // await sfrxeth.balanceOf(actingUser).then(a=>console.log("sfrxeth balance: "+a));


    console.log("withdraw...");

    await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    await fxusd.balanceOf(actingUser).then(a=>console.log("fxusd balance before: "+a));
    await wbtc.balanceOf(actingUser).then(a=>console.log("wbtc balance before: "+a));

    //try all withdraw types
    // await vault.withdraw(web3.utils.toWei(depositAmount,"ether"),{from:actingUser}).then(a=>console.log("withdraw via ftoken success")).catch(a=>console.log("revert normal withdraw: " +a));
    // await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    // await vault.withdrawFxUsd(web3.utils.toWei(fxusdAmount,"ether"),{from:actingUser}).then(a=>console.log("withdraw via fxusd success")).catch(a=>console.log("revert fxusd withdraw: " +a));
    // await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    var leftover = await gauge.balanceOf(vault.address)
    await vault.withdrawAsBase(leftover,0,{from:actingUser}).then(a=>console.log("withdraw via basetoken success")).catch(a=>console.log("revert base withdraw: " +a));
    console.log("withdraw complete");

    await gauge.balanceOf(vault.address).then(a=>console.log("gauge balance of vault: " +a));
    await fxusd.balanceOf(actingUser).then(a=>console.log("fxusd balance after: "+a));
    await wbtc.balanceOf(actingUser).then(a=>console.log("wbtc balance after: "+a));
    

  });
});


