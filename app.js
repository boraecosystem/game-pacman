const express = require("express");
const app = express();
const http = require("http").Server(app);
const redis = require('redis');
const httpOAuth = require('https');
//const chainApi = require('./module/chainApi').default('dev');
const ChainAPI = require('./module/chainApi').ChainAPI;
var cors = require('cors')
const cookieParser = require('cookie-parser');

// load config//
var redis_port = 6379;
var redis_host = '127.0.0.1';
var auth_redirect_uri = '';
var serv_port = 3200;
var game_uri = '/public/html/index.htm';
var chain_api_uri = '';

const env_config = require('./config/config.json');
redis_host = env_config.prod.redis_host;
redis_port = env_config.prod.redis_port;
auth_redirect_uri = env_config.prod.auth_redirect_uri;
serv_port = env_config.prod.serv_port;
game_uri = env_config.prod.game_uri;
chain_api_uri = env_config.prod.chain_api_uri;
auth_api_uri = env_config.prod.auth_api_uri;

// W2B constant
const appNo = 100004;
const clientId = 'X0yT6nI69Q';
const clientSecret = 'yM5pnll9GwdMjkapd7MWX0';
const keyRanking = appNo + '_rank';
const scoreMultiple = 100000000000;
let userBpAddress;

const redisClient = redis.createClient(redis_port, redis_host);
redisClient.on('connect', function () {
    console.log('Redis connected ' + ' [ip]' + redis_host + ':' + redis_port);
});

app.use(cookieParser());
app.use(cors());
app.options('*', cors());
app.disable('etag');
app.set('port', serv_port);
app.use(express.static(__dirname + '/public'));

let clientAccessToken = '';
getClientToken(res => {
    clientAccessToken = res.access_token;
    console.log('clientToken=', clientAccessToken);
});

app.get("/", function (req, res) {
    userBpAddress = req.query.bpaddress;
    res.cookie('bpAddress', userBpAddress);

    res.sendFile(__dirname + game_uri);
});

app.get('/token', (req, res) => {
    const redirectUri = encodeURIComponent(auth_redirect_uri);
    const data = `grant_type=authorization_code&code=${req.query.code}&redirect_uri=${redirectUri}`;

    getUserToken(data, tokenInfo => {
        //members info//
        res.send(tokenInfo);
    });
});

app.get('/memberAddr', (req, res) => {
    console.log(req.headers);
    if (!req.headers.authorization) {
        return res.status(500).send('access token required');
    }
    var userAccessToken = req.headers.authorization.split(' ')[1];
    console.log('userAccessToken =' + userAccessToken);
    
    var chainApi = new ChainAPI(chain_api_uri);
    chainApi.getMemberAddr(userAccessToken, function (err, result) {
        if (!err) {
			console.log('getMemberAddr:' + JSON.stringify(result));
            res.status(200).send(result);
        } else {
			console.log('getMemberAddr failure:' + JSON.stringify(result));
			console.error(err.message);
            res.status(500).send(err);
        }
    });
});

app.get("/saveScore", function (req, res) {
    var amount = req.query.amount;
    const toAddr = req.cookies.bpAddress;
    var chainApi = new ChainAPI(chain_api_uri);
    chainApi.saveScore(clientAccessToken, toAddr, amount, function (err, data) {
        if (!err) {
			console.log('saveScore:' + JSON.stringify(data));
            res.send(data);
        } else {
			console.log('saveScore failure:' + JSON.stringify(data));
			console.error(err.message);
            res.send(data);
        }
    });
});

app.get('/get_rank', function (req, res) {
    redisClient.ZREVRANGE(keyRanking, 0, 5, 'WITHSCORES', function (error, data) {
        if (error) {
            console.log('redis ZREVRANGE error', { error: error.toString() });
            res.send(error);
        }
        else {
            res.send(data);
        }
    });
});

app.get('/save_rank', function (req, res) {
    const toAddr = req.cookies.bpAddress;
    const timeStamp = Math.floor(new Date() / 1000);
    const scoreGame = req.query.score;
    const scoreRedis = (scoreGame * scoreMultiple) + (scoreMultiple - timeStamp);

    redisClient.ZSCORE(keyRanking, toAddr, function (error, data) {
        if (data) {
            if (Math.floor(data / scoreMultiple) < scoreGame) {
                res.send(redisClient.ZADD(keyRanking, 'CH', scoreRedis, toAddr));
            } else {
                res.send('save_rank: saved score is higher.');
            }
        } else {
            res.send(redisClient.ZADD(keyRanking, 'CH', scoreRedis, toAddr));
        }
    });

});

http.listen(app.get('port'), function () {
    console.log('Pacman server on! ', app.get('port'));
});

function getUserToken(data, cb) {
    const req = httpOAuth.request({
        protocol: 'https:',
        host: auth_api_uri,
        port: 443,
        method: 'post',
        path: '/member/oauth/token',
        auth: `${clientId}:${clientSecret}`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => cb(JSON.parse(body)));
        console.log(body);
    }
    );
    req.on('error', e => console.error(`problem with request getUserToken: ${e.message}`));
    req.write(data);
    req.end();
}

// Client Credential Grant

function getClientToken(cb) {
    const data = 'grant_type=client_credentials';
    const req = httpOAuth.request({
        protocol: 'https:',
        host: auth_api_uri,
        port: 443,
        method: 'post',
        path: '/member/oauth/token',
        auth: `${clientId}:${clientSecret}`,
        //auth: new Buffer(`${clientId}:${clientSecret}`).toString('base64'),
        headers: {
			//'Authorization': 'Basic ' + new Buffer(clientId + ':' + clientSecret).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => cb(JSON.parse(body)));
    });
    req.on('error', e => console.error(e,`problem with request getClientToken: ${e.message}`));
    req.write(data);
    req.end();
}
