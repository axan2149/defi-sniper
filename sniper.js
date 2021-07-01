const Web3 = require("web3");
const abiDecoder = require('abi-decoder');
//require("web3.eth");
const Common = require('ethereumjs-common');
var abi = require('human-standard-token-abi')
const solc = require("solc");
const Tx = require('ethereumjs-tx')
const fs = require('fs');
let rawdata = fs.readFileSync('wallet.json');
const wallet = JSON.parse(rawdata);
const rpcAddress = wallet.rpc;
const account = wallet.account;
const key = Buffer.from(wallet.key,"hex");
const emptyAdd = wallet.emptyAdd;
const web3 = new Web3(new Web3.providers.HttpProvider(rpcAddress));
var fromContract = {"address":wallet.fromContract,"contract":new web3.eth.Contract(abi, wallet.fromContract), "decimals":0, "name":""};
var maticContract = {"address":wallet.matic,"contract":new web3.eth.Contract(abi, wallet.matic), "decimals":0, "name":""};
var toContract = {"address":wallet.toContract,"contract":new web3.eth.Contract(abi, wallet.toContract), "decimals":0, "name":""};
var qsRouter = new web3.eth.Contract(wallet.qsRouterABI, wallet.qsRouterAdd,{from: account});
var ssRouter = new web3.eth.Contract(wallet.ssRouterABI, wallet.ssRouterAdd,{from: account});
wallet.router = qsRouter;
wallet.routerAddress = wallet.qsRouterAdd;
var totalSpent = 0;
async function main() {
    await getContractInfo(toContract);//.then(() => {console.log(contractDecimal)});;
	await getContractInfo(fromContract);
	await getContractInfo(maticContract);
	//console.log( Math.random().toString().slice(2,7));
	await loop();
    console.log('inside: ');
}

main();  
async function loop(){
	try{
		var count = await web3.eth.getTransactionCount(account,'pending');
		console.log(count);
	var result = await buy(wallet.loopSpend);
	console.log("Buy Result " + result);
	if(result)
	{
		totalSpent += wallet.loopSpend;
	}
	console.log("total Spent - " + totalSpent);
	}
	catch(e) {
        console.log(e);
		
    }
	if(totalSpent < wallet.totalSpend)
	{
		setTimeout( function () {
			loop().then(() => {});
		},wallet.loopTimeInSeconds * 1000);
	}
}
async function getContractInfo(contract)
{
	try{
		var name = await contract.contract.methods.name().call(); 
		console.log('The token name is: ' + name) ;
		var decimal = await contract.contract.methods.decimals().call(); 
		console.log('The token decimal is: ' + decimal);
		contract.decimals = decimal;
		contract.name = name;
		if(fromContract.address.trim().toLowerCase() == contract.address.trim().toLowerCase())
		{
		var allowanceResult = await checkAndApprove(contract);
		if(!allowanceResult) return {"approval":allowanceResult};
		}
		var balance = await getBalance(contract);
		console.log( contract.name +' balance - ' + balance[1]);
	}
	catch(e) {
        console.log(e);
    }
}
async function getBalance(contract)
{
	try{
	var balance = await contract.contract.methods.balanceOf(wallet.account).call();
	if(contract.address === maticContract.address)
	{
		balance = await web3.eth.getBalance(wallet.account);
	}
	return [balance, getActualTokens(contract,balance)];
	}
	catch(e) {
        console.log(e);
		return [0, 0];
    }
}
async function checkAndApprove(contract)
{
	try{
	var allowance = await contract.contract.methods.allowance(account,wallet.routerAddress).call();
	if(allowance) 
		{ 
			console.log('Allowance for contract is ' + allowance) ;
			if(allowance <= 0)
			{
				var data = contract.contract.methods.approve(wallet.routerAddress, 9007199254);
				
				await sendTransaction(contract.address,data,0);
			}
			return true;
		}
		else
		{
			return false;
		}
		}
	catch(e) {
        console.log(e);
		return false;
    }
}
async function buy(amt)
{
	try{
	console.log("Buying - " + toContract.name);
	var amount = await wallet.router.methods.getAmountsOut
	( amt*10000, [fromContract.address,toContract.address]).call();
	console.log(amount);
	if(!amount)
	{
		return false;
	}
	console.log(getWeiTokens(fromContract,amount[0]));
	var invPrice = parseFloat(amount[1])/
	parseFloat(formatTokens(amount[0],
	Math.abs(fromContract.decimals -   toContract.decimals)));
	var price = parseFloat(formatTokens(amount[0], 
	Math.abs(fromContract.decimals -  toContract.decimals)))/parseFloat(amount[1]);
	var inAmount = parseFloat(amount[0]/10000);
	var outOgAmount = parseFloat(amount[1]/10000);
	console.log("Price " + price + " " + fromContract.name + " = 1 " + toContract.name);
	console.log("Price " + invPrice + " " + toContract.name + " = 1 " + fromContract.name);
	var outAmount = outOgAmount;
	console.log(inAmount, outAmount,getWeiTokens(toContract, (outAmount - (outAmount * wallet.slippage/100))));
	outAmount = getReverseWeiTokens((outAmount - (outAmount * wallet.slippage/100)), Math.abs(fromContract.decimals -   toContract.decimals) );//*Math.pow(10,contractPairDecimal);
	console.log(inAmount, outAmount);
	var buyResult = await sendBuy(inAmount,outAmount,wallet);
	if(buyResult.status)
	{
		var balance = await getBalance(toContract);
		console.log( toContract.name +' balance - ' + balance[1]);
		return true;
	}
	else{
		console.log("transaction failed - ");
		return false;
	}
	}
	catch(e) {
        console.log(e);
    }
	return false;
}
function getReverseWeiTokens(balance, decimals) {
    if (!balance || balance == 0) return 0;
    return balance / Math.pow(10, decimals)
}
async function sendBuy(inAmount, outAmount,wallet) {
	console.log(inAmount,outAmount);
	var data = wallet.router.methods.swapExactTokensForTokens(
		web3.utils.toHex(getWeiTokens(fromContract,inAmount)),
		web3.utils.toHex(Math.floor(getWeiTokens(toContract, outAmount))),
		[fromContract.address,toContract.address],
        wallet.account,
        web3.utils.toHex(Math.round(Date.now()/1000)+60*10),
    );
	console.log(Math.round(Date.now()/1000)+60*10);
	console.log("signing tx");
	var tValue = 0;
	if(fromContract.address.trim().toLowerCase() == maticContract.address.trim().toLowerCase())
	{
		tValue = getWeiTokens(maticContract, inAmount);
	}
	var result = await sendTransaction(wallet.routerAddress,data,
	  web3.utils.toHex(tValue));
    return result;
}
function getActualTokens(contract,balance)
{
	if(!balance || balance == 0) return 0;
	return balance/Math.pow(10,contract.decimals)
}
function formatTokens(balance, decimals)
{
	//return balance;
	console.log(decimals + " - " + balance + " - " + balance/Math.pow(10,decimals));
	if(!balance || balance == 0) return 0;
	return balance*Math.pow(10,decimals);
}
function getWeiTokens(contract,balance)
{
	if(!balance || balance == 0) return 0;
	return balance*Math.pow(10,contract.decimals)
}
async function sendTransaction(toAddress,data,transactionValue)
{
	try{
		var count = await web3.eth.getTransactionCount(account,'pending');
		//var latestBlock = await web3.eth.getBlock("latest");
		var gasPrice = await web3.eth.getGasPrice();

	 console.log((count )  + " " + gasPrice
	 + " " + Math.ceil(gasPrice*wallet.gwei));
	 //return;
	 //console.log(gasPrice);
	 //return;
		var rawTransaction = {
			"from":account,
			"gasPrice":web3.utils.toHex(Math.ceil(gasPrice*wallet.gwei)),
			"gasLimit":web3.utils.toHex(756389),
			"to":toAddress,
			"value":web3.utils.toHex(transactionValue),
			"data":data.encodeABI(),
			"nonce":web3.utils.toHex(count)
		};
		const common1 = Common.default.forCustomChain(
				'mainnet',{
				  name: 'matic',
				  networkId: 137,
				  chainId: 137
				},
				'petersburg'
			  )
		var transaction = new Tx.Transaction(rawTransaction ,{common: common1});
		
		transaction.sign(key);
		//console.log(transaction.toJSON());
		console.log("sending tx");
		console.log(getTime() + transaction.hash(true).toString('hex'));
		
		
		var result = await web3.eth.sendSignedTransaction
		('0x' + transaction.serialize().toString('hex'));
		//console.log(result)
		console.log(getTime() + "Tx Status " + result.status );
		console.log(getTime() + "Tx Hash : " + result.transactionHash);
		return result;
	}
	catch(e) {
        console.log(e);
    }
	return false;
}
function getTime()
{
	var currentdate = new Date(); 
var datetime =  currentdate.getHours() + ":"  
                + currentdate.getMinutes() + ":" 
                + currentdate.getSeconds();
	return datetime + " - ";
}