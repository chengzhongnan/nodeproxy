var express = require('express');
var request = require('request');
var app = express();
var crypto = require('crypto');
var fs = require('fs');

var process = require('process');

let rawHost = 'wwwcore.ftgame.com.cn';
let rawUrl = `https://${rawHost}`;

process.on('uncaughtException', function (err) {
    console.error('An uncaught error occurred!');
    console.error(err.stack);
});

let cacheContent = true;

let cacheObject = new Map();
let cacheFile = new Map();

app.use(/.*wp-admin.*/, (req, res) => {
    res.status(404);
})

app.use('/wp-login.php', (req, res) => {
    res.status(404);
})

app.use('/', (req, res) => {
    try {
        let url = rawUrl + req.originalUrl;
        console.log(url);
        // return req.pipe(request(url)).pipe(res);

        let regUrlExt = new RegExp('.*\.(js)|(png)|(jpg)|(gif)|(svg)|(ico)|(css)|(woff)|(ttf)|(eot)|(otf)');
        if (regUrlExt.test(req.path)) {
            if (cacheContent && cacheFile.has(req.path)) {
                let fileObject = cacheFile.get(req.path);
                res.set(fileObject.resp.headers);
                let readStream = fs.createReadStream(fileObject.path);
                readStream.pipe(res);
            } else {
                if (cacheContent) {
                    let md5 = crypto.createHash('md5');
                    let fileName = './cache/' + md5.update(req.path).digest('hex');
                    var writeStream = fs.createWriteStream(fileName, {
                        autoClose: true
                    });
                    writeStream.on('finish', () => {
                        let fileObject = cacheFile.get(req.path);
                        let readStream = fs.createReadStream(fileName);
                        res.set(fileObject.resp.headers);
                        readStream.pipe(res);
                    })
                    
                    request(url).on('response', function (resp) {
                        let respObject = {
                            path: fileName,
                            resp: resp
                        };
                        cacheFile.set(req.path, respObject);
                    }).pipe(writeStream);
                } else {
                    req.pipe(request(url)).pipe(res);
                }
            }

            return;
        }

        if (cacheContent && cacheObject.has(req.path)) {
            let cacheResp = cacheObject.get(req.path);
            res.set(cacheResp.headers);

            return res.end(cacheResp.body);
        }

        return req.pipe(request(url, (err, resp, body) => {
            if (err === null) {
                resp.body = body;
                cacheObject.set(resp.request.path, resp);
            } else {
                console.error(err);
            }
        })).pipe(res);
    } catch (e) {
        console.log(e);
    }
});

app.listen(3000);
