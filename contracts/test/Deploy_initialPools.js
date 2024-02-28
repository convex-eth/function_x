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

    //deploy
    let voteproxy = await FxnVoterProxy.at(contractList.system.voteProxy);
    let cvxfxn = await cvxFxnToken.at(contractList.system.cvxFxn);
    let fxndeposit = await FxnDepositor.at(contractList.system.fxnDepositor);
    let booster = await Booster.at(await voteproxy.operator());
    let staking = await cvxFxnStaking.at(contractList.system.cvxFxnStaking);
    let stakingFeeReceiver = await FeeReceiverCvxFxn.at(contractList.system.cvxFxnStakingFeeReceiver);
    let feeQueue = await FeeDepositV2.at(contractList.system.vefxnRewardQueue);
    let vault_erc = await StakingProxyERC20.at(contractList.system.vault_erc);
    let vault_rebalance = await StakingProxyRebalancePool.at(contractList.system.vault_rebalance);

    console.log("\n\ncreate pools...");
    let fethPool = await IFxnGauge.at("0xc6dEe5913e010895F3702bc43a40d661B13a40BD");
    let fxusdPool = await IFxnGauge.at("0xb925F8CAA6BE0BFCd1A7383168D1c932D185A748");
    let feth = await IERC20.at("0x53805A76E1f5ebbFE7115F16f9c87C2f7e633726");
    let cvxfxngauge = await IFxnGauge.at("0xfEFafB9446d84A9e58a3A2f2DDDd7219E8c94FbB");
    let cvxfxnlptoken = await IERC20.at("0x1062fd8ed633c1f080754c19317cb3912810b5e5");
  
    await advanceTime(day);

    await setNoGas();
    var tx = await booster.addPool(vault_rebalance.address, fethPool.address, feth.address,{from:deployer,gasPrice:0});
    console.log("pool added feth, gas: " +tx.receipt.gasUsed);
    var tx = await booster.addPool(vault_rebalance.address, fxusdPool.address, sfrxeth.address,{from:deployer,gasPrice:0});
    console.log("pool added sfrxeth-fxusd, gas: " +tx.receipt.gasUsed);
    var tx = await booster.addPool(vault_erc.address, cvxfxngauge.address, cvxfxnlptoken.address,{from:deployer,gasPrice:0});
    console.log("pool added cvxfxn gauge, gas: " +tx.receipt.gasUsed);

  });
});


