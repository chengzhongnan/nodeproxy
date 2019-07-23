var express = require('express');
var request = require('request');
var app = express();
var concat = require('concat-stream');
var fs = require('fs');

var process = require('process');

let rawHost = '172.19.0.17:8000';
let targetHost = 'wwwcore.ftgame.com.cn';
let rawUrl = `http://${rawHost}`;
let targetUrl = `https://${targetHost}`;


const replaceBanner = [
    {
        name: 'banner轮播-1',
        url: 'https://item.taobao.com/item.htm?spm=a1z10.1-c-s.w5003-21824560351.1.1c5e594cYZOsDx&id=597797675321&scene=taobao_shop'
    },
    {
        name: 'banner轮播-2',
        url: 'https://item.taobao.com/item.htm?spm=a1z10.1-c-s.w4001-21824417621.1.1c5e594cYZOsDx&id=597798815425&scene=taobao_shop'
    },
    {
        name: 'banner轮播-3',
        url: 'https://shop210063440.taobao.com/?spm=2013.1.0.0.1b0a376bJlkE0d'
    }
];

process.on('uncaughtException', function (err) {
    console.error('An uncaught error occurred!');
    console.error(err.stack);
});

function replaceAll(text, raw, dict) {
    let reg = new RegExp(`${raw}`, 'ig');
    return text.replace(reg, dict);
}

/**
 * 
 * @param {String} body 
 */
function filterResponse(body) {
    body = replaceAll(body, rawUrl, targetUrl);
    body = replaceAll(body, `http:[^"]+${rawHost}`, `https:\\/\\/${targetHost}`)
    body = replaceAll(body, encodeURIComponent(rawUrl), encodeURIComponent(targetUrl));
    body = replaceAll(body, rawHost, rawUrl);
    body = replaceAll(body, 'http:', 'https:');
    

    let r = new RegExp('<a[^<>]*href=\"([^"]+)\"[^<>]*>[^<>]*<img[^<>]*class=\"slick-slide-image\"[^<>]*alt=\"([^"]+)\"[^<>]*>', 'ig');

    let match = r.exec(body);
    while(match != null) {
        let find = replaceBanner.find(x => x.name == match[2])
        if (find != null) {
            let newContent = match[0].replace(/href=\"[^\"]+\"/, `href=\"${find.url}\"`);
            body = body.replace(match[0], newContent);
        }
        match = r.exec(body);
    }

    // let r2 = new RegExp('<div[^<>]+pagePreloadLoading[^<>]+>[^<>]*<[^<>]+>[^<>]*</div>');
    // body = body.replace(r2, '');

    body = body.replace('</head>', ` <script type='text/javascript' src='${targetUrl}/ftgame.js'></script>
        </head> `);

    return body;
}

app.use('/ftgame.js', (req, res) => {
    fs.readFile('./ftgame.js', (err, data) => {
        res.set({
            "content-type": 'application/javascript'
        })
        res.send(data.toString('utf-8'));
    })
})

app.use('/wp-login.php', (req, res) => {
    let url = rawUrl + req.originalUrl;
    console.log(url);

    if (req.headers['accept-encoding'] && req.headers['accept-encoding'].indexOf('gzip') != -1) {
        req.headers['accept-encoding'] = req.headers['accept-encoding'].replace(/gzip,?/, '');
    }

    if (req.headers['origin'] && req.headers['origin'].indexOf() != -1) {
        req.headers['origin'] = req.headers['origin'].replace(targetUrl, rawUrl);
    }

    if (req.headers['referer'] && req.headers['referer'].indexOf(targetUrl) != -1) {
        req.headers['referer'] = req.headers['referer'].replace(targetUrl, rawUrl);
    }

    req.pipe(request(url)).on('response', function(resp) {
        if (resp.headers['location'] && resp.headers['location'].indexOf(rawUrl) != -1) {
                resp.headers['location'] = resp.headers['location'].replace(rawUrl, targetUrl); 
        }
    }).pipe(res);
})

let cacheContent = false;

let cacheObject = new Map();

let cachePagePath = [
    '/',
    '/index.php',
    '/game',
    '/game/',
    '/game/index.php',
    '/about',
    '/about/',
    '/about/index.php'
];

app.use('/', (req, res) => {
    try {
        let url = rawUrl + req.originalUrl;
        console.log(req.path);

        if (cacheContent && cacheObject.has(req.path)) {
            let cacheResp = cacheObject.get(req.path);
            res.set(cacheResp.headers);
            
            return res.end(cacheResp.body);
        }

        let regUrlExt = new RegExp('.*\.(js)|(png)|(jpg)|(gif)|(svg)|(ico)|(css)|(woff)|(ttf)|(eot)|(otf)');
        if (regUrlExt.test(req.path)) {
            return req.pipe(request(url, (err, resp, body) => {
                if (err === null) {
                    resp.body = body;
                    cacheObject.set(resp.request.path, resp);
                } else {
                    console.error(err);
                }
            })).pipe(res);
        }

        if (req.headers['accept-encoding'] && req.headers['accept-encoding'].indexOf('gzip') != -1) {
            req.headers['accept-encoding'] = req.headers['accept-encoding'].replace(/gzip,?/, '');
        }

        if (req.headers['origin'] && req.headers['origin'].indexOf() != -1) {
            req.headers['origin'] = req.headers['origin'].replace(targetUrl, rawUrl);
        }

        if (req.headers['referer'] && req.headers['referer'].indexOf(targetUrl) != -1) {
            req.headers['referer'] = req.headers['referer'].replace(targetUrl, rawUrl);
        }

        let needFilter = false;
        let respHeaders = [];
        req.pipe(request(url)).on('response', function(resp) {
            if (resp.headers['location'] && resp.headers['location'].indexOf(rawUrl) != -1) {
                    resp.headers['location'] = resp.headers['location'].replace(rawUrl, targetUrl); 
            }
            if (resp.headers["content-type"] && resp.headers["content-type"].indexOf('charset') != -1) {
                needFilter = true;
            }
            
            respHeaders = resp.headers;

        }).pipe(concat(function(response) {
            // console.log(respHeaders);
            res.set(respHeaders);
            res.set('link', targetUrl);
            
            if (needFilter) {
                if (response != undefined) {
                    response = filterResponse(response.toString());
                    res.set('content-length', response.length);
                }
                if (cachePagePath.indexOf(req.path) != -1) {
                    let cacheResponse = {};
                    cacheResponse.body = response;
                    cacheResponse.headers = res.getHeaders();
                    cacheObject.set(req.path, cacheResponse);
                }
                res.end(response);
            } else {
                try {

                    if (cachePagePath.indexOf(req.path) != -1) {
                        let cacheResponse = {};
                        cacheResponse.body = response;
                        cacheResponse.headers = res.getHeaders();
                        cacheObject.set(req.path, cacheResponse);
                    }

                    res.end(response);
                }
                catch(e) {
                    console.log(url);
                    console.log(e);
                    res.end({});
                }
            }
          }));
    } catch(e) {
      console.log(e);
    }
});

app.listen(3000);
