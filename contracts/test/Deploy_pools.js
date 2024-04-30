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
const IFxUsd = artifacts.require("IFxUsd");
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

contract("Deploy Pools", async accounts => {
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
    let poolReg = await PoolRegistry.at(contractList.system.poolReg);
    let feeReg = await FeeRegistry.at(contractList.system.feeReg);

    // var rusd = "0x65D72AA8DA931F047169112fcf34f52DbaAE7D18"
    // var newimp = await StakingProxyRebalancePool.new(poolReg.address, feeReg.address, contractList.fxn.tokenMinter, rusd, {from:deployer});
    // console.log("newimp " +newimp.address);
    // return;

    // var btcusd = "0x9D11ab23d33aD026C466CE3c124928fDb69Ba20E"
    // var newimp = await StakingProxyRebalancePool.new(poolReg.address, feeReg.address, contractList.fxn.tokenMinter, btcusd, {from:deployer});
    // console.log("newimp " +newimp.address);
    // return;

    console.log("\n\ncreate pools...");

    var deployedData = [];

    const deployRebalancePool = async (stakingAddress, targetname, usdtype) => {
      var imp = vault_rebalance.address;
      if(usdtype=="rusd"){
        imp = contractList.system.vault_rebalance_rusd;
        console.log("using rusd..")
      }
      if(usdtype=="btcusd"){
        imp = contractList.system.vault_rebalance_btcusd;
        console.log("using btcusd..")
      }
      console.log("\n----- Deploy Rebalance Pool ------\n");
      console.log("name: " +targetname);
      console.log("imp: " +imp);
      var pool = await IFxnGauge.at(stakingAddress);
      console.log("pool: " +pool.address);

      //get stakingToken
      var stakingToken = await pool.asset();
      console.log("stakingToken: " +stakingToken);

      //check that we have sharing enabled
      var sharecheck = await IFxUsd.at(stakingAddress);
      var issharing = await sharecheck.hasRole("0x8d4998b5742dab4ffcf0a281dc749862b71ae54ba53b035bfb1d3dbc23ddc35d", contractList.system.voteProxy);
      console.log("has sharing enabled? " +issharing);
      if(!issharing){
        console.log("NO SHARING, Skipping pool");
        return;
      }
  
      //add pool
      var tx = await booster.addPool(imp, pool.address, stakingToken, {from:deployer});
      console.log("pool added, gas: " +tx.receipt.gasUsed);

      var poolLength = await poolReg.poolLength();
      console.log("pool id: " +(poolLength-1) );

      var poolinfo = await poolReg.poolInfo(poolLength-1);
      console.log("pool info: " +JSON.stringify(poolinfo));

      deployedData.push({
        id: poolLength-1,
        implementation: imp,
        stakingAddress: pool.address,
        stakingToken: stakingToken,
        rewardsAddress: poolinfo.rewardsAddress,
        name: targetname
      })
    }

    const deployERC20Pool = async (stakingAddress, targetname) => {
      var imp = vault_erc.address;
      console.log("\n----- Deploy erc20 Pool ------\n");
      console.log("name: " +targetname);
      console.log("imp: " +imp);
      var pool = await IFxnGauge.at(stakingAddress);
      console.log("gauge: " +pool.address);

      //get stakingToken
      var stakingToken = await pool.stakingToken();
      console.log("stakingToken: " +stakingToken);
  
      //add pool
      var tx = await booster.addPool(imp, pool.address, stakingToken, {from:deployer});
      console.log("pool added, gas: " +tx.receipt.gasUsed);

      var poolLength = await poolReg.poolLength();
      console.log("pool id: " +(poolLength-1) );

      var poolinfo = await poolReg.poolInfo(poolLength-1);
      console.log("pool info: " +JSON.stringify(poolinfo));

      deployedData.push({
        id: poolLength-1,
        implementation: imp,
        stakingAddress: pool.address,
        stakingToken: stakingToken,
        rewardsAddress: poolinfo.rewardsAddress,
        name: targetname
      })
    }

    //rebalance pools
    // await deployRebalancePool("0xc6dEe5913e010895F3702bc43a40d661B13a40BD", "RebalancePool - fEth wsteth");
    // await deployRebalancePool("0xB87A8332dFb1C76Bb22477dCfEdDeB69865cA9f9", "RebalancePool - fEth xsteth");
    // await deployRebalancePool("0x9aD382b028e03977D446635Ba6b8492040F829b7", "RebalancePool - fxusd wsteth");
    // await deployRebalancePool("0x0417CE2934899d7130229CDa39Db456Ff2332685", "RebalancePool - fxusd xsteth");
    // await deployRebalancePool("0xb925F8CAA6BE0BFCd1A7383168D1c932D185A748", "RebalancePool - fxusd sfrxeth");
    // await deployRebalancePool("0x4a2ab45D27428901E826db4a52Dae00594b68022", "RebalancePool - fxusd xfrxeth");

    // //lps
    // await deployERC20Pool("0xA5250C540914E012E22e623275E290c4dC993D11", "CurveConvex LP - Fxn/Eth");
    // await deployERC20Pool("0xfEFafB9446d84A9e58a3A2f2DDDd7219E8c94FbB", "CurveConvex LP - cvxFxn/Fxn");
    // await deployERC20Pool("0x5b1D12365BEc01b8b672eE45912d1bbc86305dba", "CurveConvex LP - sdFxn/Fxn");
    

    // await deployERC20Pool("0xF4Bd6D66bAFEA1E0500536d52236f64c3e8a2a84", "CurveConvex LP - crvUSD/fxUSD");
    // await deployERC20Pool("0xeD113B925AC3f972161Be012cdFEE33470040E6a", "CurveConvex LP - pyUSD/fxUSD");
    // await deployERC20Pool("0x61F32964C39Cca4353144A6DB2F8Efdb3216b35B", "CurveConvex LP - Dola/fxUSD");
    // await deployERC20Pool("0xfa4761512aaf899b010438a10C60D01EBdc0eFcA", "CurveConvex LP - Grai/fxUSD");
    // await deployERC20Pool("0x31b630B21065664dDd2dBa0eD3a60D8ff59501F0", "CurveConvex LP - Frax/fxUSD");
    // await deployERC20Pool("0xf0A3ECed42Dbd8353569639c0eaa833857aA0A75", "CurveConvex LP - GHO/fxUSD");
    // await deployERC20Pool("0xDbA9a415bae1983a945ba078150CAe8b690c9229", "CurveConvex LP - mkUSD/fxUSD");
    // await deployERC20Pool("0x0d3e9A29E856CF00d670368a7ab0512cb0c29FAC", "CurveConvex LP - ULTRA/fxUSD");
    

    // await deployRebalancePool("0xc2DeF1E39FF35367F2F2a312a793477C576fD4c3", "RebalancePool - rUSD weETH","rusd");
    // await deployRebalancePool("0x7EB0ed173480299e1310d55E04Ece401c2B06626", "RebalancePool - rUSD xeETH","rusd");


    // await deployERC20Pool("0x697DDb8e742047561C8e4bB69d2DDB1b8Bb42b60", "CurveConvex LP - fxUSD/rUSD");
    // await deployERC20Pool("0x9c7003bC16F2A1AA47451C858FEe6480B755363e", "CurveConvex LP - alUSD/fxUSD");
    
    // await deployRebalancePool("0xf58c499417e36714e99803Cb135f507a95ae7169", "RebalancePool - rUSD wezETH","rusd");
    // await deployRebalancePool("0xBa947cba270D30967369Bf1f73884Be2533d7bDB", "RebalancePool - rUSD xezETH","rusd");

    // await deployRebalancePool("0xf291EC9C2F87A41386fd94eC4BCdC3270eD04482", "RebalancePool - btcUSD wbtc","btcusd");
    // await deployRebalancePool("0xBB549046497364A1E26F94f7e93685Dc29FAd8c0", "RebalancePool - btcUSD xwbtc","btcusd");

    await deployERC20Pool("0xDF7fbDBAE50C7931a11765FAEd9fe1A002605B55", "CurveConvex LP - MIM/fxUSD");
    await deployERC20Pool("0x4CA79F4FE25BCD329445CDBE7E065427ACa98380", "CurveConvex LP - rgUSD/fxUSD");
    await deployERC20Pool("0x5801Bb8f568979C722176Df36b1a74654A9C52b5", "CurveConvex LP - USDe/fxUSD");

    console.log("data:");
    console.log(JSON.stringify(deployedData, null, 4));
    console.log("done");

  });
});


