/*eslint-env node*/
'use strict';
(function () {
    var express = require('express');
    var compression = require('compression');
    var fs = require('fs');
    var url = require('url');
    var request = require('request');
    var soap = require('soap');
    var path = require('path')
    var bodyParser = require("body-parser");
    var str2json = require('string-to-json');
    var app = express();
    var gzipHeader = Buffer.from('1F8B08', 'hex');
	var terrainAnalysisClient = require('./Nextgen3DWeb/js/Trn_Analysis/TerrainAnalysisClient.js');
	var PropertiesReader = require('properties-reader');
    var properties = PropertiesReader('./Nextgen3DWeb/config.properties');
    var hostAddress = properties.get('localHost');
    var wsdlURL = properties.get('wsdl');
    

    //const unf = require("unique-filename");
    //var uniqueFilename = require('unique-filename');
    var yargs = require('yargs').options({
        'port': {
            'default': 8080,
            'description': 'Port to listen on.'
        },
        'public': {
            'type': 'boolean',
            'description': 'Run a public server that listens on all interfaces.'
        },
        'upstream-proxy': {
            'description': 'A standard proxy server that will be used to retrieve data.  Specify a URL including port, e.g. "http://proxy:8000".'
        },
        'bypass-upstream-proxy-hosts': {
            'description': 'A comma separated list of hosts that will bypass the specified upstream_proxy, e.g. "lanhost1,lanhost2"'
        },
        'help': {
            'alias': 'h',
            'type': 'boolean',
            'description': 'Show this help.'
        }
    });
    var argv = yargs.argv;

    if (argv.help) {
        return yargs.showHelp();
    }

    // eventually this mime type configuration will need to change
    // https://github.com/visionmedia/send/commit/d2cb54658ce65948b0ed6e5fb5de69d022bef941
    // *NOTE* Any changes you make here must be mirrored in web.config.
    var mime = express.static.mime;
    mime.define({
        'application/json': ['czml', 'json', 'geojson', 'topojson'],
        'image/crn': ['crn'],
        'image/ktx': ['ktx'],
        'model/gltf+json': ['gltf'],
        'model/gltf-binary': ['bgltf', 'glb'],
        'application/octet-stream': ['b3dm', 'pnts', 'i3dm', 'cmpt', 'geom', 'vctr'],
        'text/plain': ['glsl']
    }, true);

    var app = express();
    app.use(compression());
    app.use(function (req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        next();
    });

    function checkGzipAndNext(req, res, next) {
        var reqUrl = url.parse(req.url, true);
        var filePath = reqUrl.pathname.substring(1);

        var readStream = fs.createReadStream(filePath, { start: 0, end: 2 });
        readStream.on('error', function (err) {
            next();
        });

        readStream.on('data', function (chunk) {
            if (chunk.equals(gzipHeader)) {
                res.header('Content-Encoding', 'gzip');
            }
            next();
        });
    }

    var knownTilesetFormats = [/\.b3dm/, /\.pnts/, /\.i3dm/, /\.cmpt/, /\.glb/, /\.geom/, /\.vctr/, /tileset.*\.json$/];
    app.get(knownTilesetFormats, checkGzipAndNext);

    app.use(express.static(__dirname));

    function getRemoteUrlFromParam(req) {
        var remoteUrl = req.params[0];
        if (remoteUrl) {
            // add http:// to the URL if no protocol is present
            if (!/^https?:\/\//.test(remoteUrl)) {
                remoteUrl = 'http://' + remoteUrl;
            }
            remoteUrl = url.parse(remoteUrl);
            // copy query string
            remoteUrl.search = url.parse(req.url).search;
        }
        return remoteUrl;
    }

    var dontProxyHeaderRegex = /^(?:Host|Proxy-Connection|Connection|Keep-Alive|Transfer-Encoding|TE|Trailer|Proxy-Authorization|Proxy-Authenticate|Upgrade)$/i;

    function filterHeaders(req, headers) {
        var result = {};
        // filter out headers that are listed in the regex above
        Object.keys(headers).forEach(function (name) {
            if (!dontProxyHeaderRegex.test(name)) {
                result[name] = headers[name];
            }
        });
        return result;
    }

    var upstreamProxy = argv['upstream-proxy'];
    var bypassUpstreamProxyHosts = {};
    if (argv['bypass-upstream-proxy-hosts']) {
        argv['bypass-upstream-proxy-hosts'].split(',').forEach(function (host) {
            bypassUpstreamProxyHosts[host.toLowerCase()] = true;
        });
    }

    app.get('/proxy/*', function (req, res, next) {
        // look for request like http://localhost:8080/proxy/http://example.com/file?query=1
        var remoteUrl = getRemoteUrlFromParam(req);
        if (!remoteUrl) {
            // look for request like http://localhost:8080/proxy/?http%3A%2F%2Fexample.com%2Ffile%3Fquery%3D1
            remoteUrl = Object.keys(req.query)[0];
            if (remoteUrl) {
                remoteUrl = url.parse(remoteUrl);
            }
        }

        if (!remoteUrl) {
            return res.status(400).send('No url specified.');
        }

        if (!remoteUrl.protocol) {
            remoteUrl.protocol = 'http:';
        }

        var proxy;
        if (upstreamProxy && !(remoteUrl.host in bypassUpstreamProxyHosts)) {
            proxy = upstreamProxy;
        }

        // encoding : null means "body" passed to the callback will be raw bytes

        request.get({
            url: url.format(remoteUrl),
            headers: filterHeaders(req, req.headers),
            encoding: null,
            proxy: proxy
        }, function (error, response, body) {
            var code = 500;

            if (response) {
                code = response.statusCode;
                res.header(filterHeaders(req, response.headers));
            }

            res.status(code).send(body);
        });
    });

    //middleware to access body-parser
	app.use(bodyParser.json({limit: '10mb', extended: true}))
    app.use(bodyParser.urlencoded({limit: '10mb', extended: true}))
    //app.use(bodyParser.urlencoded({ extended: false }));
   // app.use(bodyParser.json());

    /*----------------------------------------------- LOS P2P Service Call -------------------------------------------------*/
    app.post('/losP2P', function (req, res) {

        //var url = wsdlURL+'xmllos?wsdl';
               
        var fileStr= req.body.response;
		//console.log("testresponse------------------------>>"+fileStr);
		console.log("losP2P");
		var httpFilePath = terrainAnalysisClient.data.losPoint(fileStr);
		console.log("httpfilePath"+httpFilePath);
		res.send(httpFilePath);
    })

	 app.post('/fileCreator', function (req, res) {

        //var url = wsdlURL+'xmllos?wsdl';
        
        var fileStr= req.body.response;
		console.log("testresponse------------------------>>"+fileStr);
		var httpFilePath = terrainAnalysisClient.data.losPoint(fileStr);
		console.log("httpfilePath"+httpFilePath);
		res.send(httpFilePath);
       
    })
    /*----------------------------------------------- Contour Analysis Service Call -------------------------------------------------*/
    app.post('/contour', function (req, res) {
        
        
        var fileStr= req.body.response;
		console.log("testresponse------------------------>>"+fileStr);
		var httpFilePath = terrainAnalysisClient.data.contour(fileStr);
		console.log("httpfilePath"+httpFilePath);
		res.send(httpFilePath);
    })

    /*----------------------------------------------- LOS Fan Service Call -------------------------------------------------*/
    app.post('/losFan', function (req, res) {

		        
        var fileStr= req.body.response;
		console.log("testresponse------------------------>>"+fileStr);
		var httpFilePath = terrainAnalysisClient.data.losPoint(fileStr);
		console.log("httpfilePath"+httpFilePath);
		res.send(httpFilePath);
    })

    /*----------------------------------------------- Shaded Relief Service Call -------------------------------------------------*/
	
	
	app.post('/shadedRelief', function(req, res){
        
        var fileStr= req.body.response;
		console.log("testresponse------------------------>>"+fileStr);
		var httpFilePath = terrainAnalysisClient.data.shadedRelief(fileStr);
		console.log("httpfilePath"+httpFilePath);
		res.send(httpFilePath);
    })

	
/*------------------------------------------------ threat dome add *********************************************/


    app.post('/threatUpdate', function(req, res){

		//var url = 'http://172.16.88.244:8081/TerrainAnalysisService/xmlgetThreatDomeInfo?wsdl';
        var url = 'http://172.16.88.244:8080/RoltaMilSdkService/xmlgetThreatDomeInfo?wsdl';                
        var threatDomeManagementDTO=req.body.threatDomeManagementDTO;                
      
                        
        var args = {arg0: threatDomeManagementDTO};
		var timeStamp = args.arg0.timeStamp;
		console.log(timeStamp);
		timeStamp = timeStamp.replace("T"," ");
		timeStamp = timeStamp.replace("Z"," ");
		//timeStamp = timeStamp.slice(-5);
		console.log(args);
		
		args.arg0.timeStamp = timeStamp;
        soap.createClient(url,
                    function(err, client) {
            if(err){
                console.log(err);
            }
			 
            client.updateThreatDomeData(args, 
                    function(err, result) {
                        var response = result.return;
						console.log(response);
                       // var httpFilePath = terrainAnalysisClient.data.shadedRelief(response);
                        res.send(response);
                    }); 
        
        });
    })	
	
		
/*------------------------------------------------ threat dome update *********************************************/


    app.post('/threatAdd', function(req, res){

		//var url = 'http://172.16.88.244:8081/TerrainAnalysisService/xmlgetThreatDomeInfo?wsdl';
        var url = 'http://172.16.88.244:8080/RoltaMilSdkService/xmlgetThreatDomeInfo?wsdl';                
        var threatDomeManagementDTO=req.body.threatDomeManagementDTO;                
      
                        
        var args = {arg0: threatDomeManagementDTO};
		var timeStamp = args.arg0.timeStamp;
		console.log(timeStamp);
		timeStamp = timeStamp.replace("T"," ");
		timeStamp = timeStamp.replace("Z"," ");
		//timeStamp = timeStamp.slice(-5);
		console.log(args);
		
		args.arg0.timeStamp = timeStamp;
        soap.createClient(url,
                    function(err, client) {
            if(err){
                console.log(err);
            }
			 
            client.addThreatDomeData(args, 
                    function(err, result) {
                        var response = result.return;
						console.log(response);
                       // var httpFilePath = terrainAnalysisClient.data.shadedRelief(response);
                        res.send(response);
                    }); 
        
        });
    })	
	 
/*---------------------- Get threat Dome data -----------------------------------------------*/	 
	 app.post('/getThreatDome', function(req, res){
		
		var url = 'http://172.16.88.244:8080/RoltaMilSdkService/xmlgetThreatDomeInfo?wsdl';
					
		var threatDomeDTO=req.body.threatDomeDTO;				
		
		console.log(threatDomeDTO);	
		var args = {arg0: threatDomeDTO};
		soap.createClient(url,
					function(err, client) {
			if(err){
				console.log(err);
			}
		
			client.getThreatDomeData(args, 
					function(err, result) {
						
						var response = result.return;
						console.log(response);
						res.send(response);
					
					});
					
		});
	})


/*---------------------- Delete threat Dome data -----------------------------------------------*/	 
	 app.post('/deleteThreatDomeData', function(req, res){
		
		var url = 'http://172.16.88.244:8080/RoltaMilSdkService/xmlgetThreatDomeInfo?wsdl';
					
		var threatDomeManagementDTO=req.body.threatDomeManagementDTO;				
		
		console.log(threatDomeManagementDTO);	
		var args = {arg0: threatDomeManagementDTO};
		soap.createClient(url,
					function(err, client) {
			if(err){
				console.log(err);
			}
		
			client.deleteThreatDomeData(args, 
					function(err, result) {
						
						var response = result.return;
						console.log(response);
						res.send(response);
					
					});
					
		});
	})
	
	 
/* ***************************** Retrieving Thread Dome data ******************************************/
	// retrive from database
	app.post('/retriveThreatDome', function(req, res){
		
		var url = 'http://172.16.88.244:8222/RoltaMilSdkService/xmlgetThreatDomeInfo?wsdl';
						
		var threatDomeManagementDTO=req.body.threatDomeManagementDTO;				
					
		var args = {arg0: threatDomeManagementDTO};
		soap.createClient(url,
					function(err, client) {
			if(err){
				console.log(err);
			}
		
			client.retrieveThreatDomeData(args, 
					function(err, result) {
						
						var response = result.return;
						console.log(response);
						res.send(response);
					
					});
					
		});
	})
	
/*-------------------------------------------- colorcoded elevation----------------------------------------------*/
 
 app.post('/MinMax', function(req, res){

		var url = 'http://172.16.88.244:8081/TerrainAnalysisService/xmlminmax?wsdl';
                        
        var minMaxDTO=req.body.minMaxDTO;                
        console.log(minMaxDTO);
                        
        var args = {arg0: minMaxDTO};
        soap.createClient(url,
                    function(err, client) {
            if(err){
                console.log(err);
            }
        
            client.getMinMax(args, 
                    function(err, result) {
                        var response = result.return;
                       // var httpFilePath = terrainAnalysis.data.shadedRelief(response);
                        res.send(response);
                    }); 
        
        });
 })
 
 
 app.post('/colorCoded', function(req, res){
    var fileStr= req.body.response;
		console.log("testresponse------------------------>>"+fileStr);
		var httpFilePath = terrainAnalysisClient.data.colorCoded(fileStr);
		console.log("httpfilePath"+httpFilePath);
		res.send(httpFilePath);
 })
 /*--------------------------------------Slope Analysis--------------------------------------------*/
 app.post('/slopeAnalysis', function(req, res){
   var fileStr= req.body.response;
		console.log("testresponse------------------------>>"+fileStr);
		var httpFilePath = terrainAnalysisClient.data.slopeAnalysis(fileStr);
		console.log("httpfilePath"+httpFilePath);
		res.send(httpFilePath);
})
 
  app.post('/MinMaxData', function(req, res){

		var url = 'http://172.16.88.244:8081/TerrainAnalysisService/xmlminmax?wsdl';
                        
        var minMaxDTO=req.body.minMaxDTO;                
        console.log(minMaxDTO);
                        
        var args = {arg0: minMaxDTO};
        soap.createClient(url,
                    function(err, client) {
            if(err){
                console.log(err);
            }
        
            client.getMinMaxData(args, 
                    function(err, result) {
                        var response = result.return;
                       // var httpFilePath = terrainAnalysis.data.shadedRelief(response);
                        res.send(response);
                    }); 
        
        });
 })
 
 /* ------------------------------------------- getUserList --------------------------------------- */

  app.post('/getUserList', function (req, res) {
        
		var url = 'http://172.16.88.244:8080/RoltaMilSdkService/xmlgetUserManagementInfo?wsdl';
		
        //var areaOfInterestDTO = req.body.areaOfInterestDTO;
		
        //var args = { arg0: areaOfInterestDTO };
		
        soap.createClient(url,
            function (err, client) {
                if (err) {
                    console.log(err);
                }
				//console.log(args);
                client.getUserList(null,
                    function (err, result) {
                        var response = result.return;
                        console.log(response);
                        res.send(response);
                    });
            });
    })
	
/* ------------------------------------------- get AOI List --------------------------------------- */

  app.post('/getAOIList', function (req, res) {
        
		var url = 'http://172.16.88.244:8222/RoltaMilSdkService/xmlAreaofInterest?wsdl';
		//var url = 'http://172.16.88.244:8081/RoltaMilSdkService/xmlAreaofInterest?wsdl';
		//var url = 'https://172.16.88.244:10000/RoltaMilSdkService/xmlAreaofInterest?wsdl';
		
        //var areaOfInterestDTO = req.body.areaOfInterestDTO;
		
        //var args = { arg0: areaOfInterestDTO };
		
        soap.createClient(url,
            function (err, client) {
                if (err) {
                    console.log(err);
                }
				//console.log(args);
                client.getAOIList(null,
                    function (err, result) {
                        var response = result.return;
                        console.log(response);
                        res.send(response);
                    });
            });
    })
 
	

    //by shubh
    var server = app.listen(argv.port, argv.public ? undefined : hostAddress, function () {
        if (argv.public) {
            console.log('Cesium development server running publicly.  Connect to http://'+hostAddress+':%d/', server.address().port);
        } else {
            console.log('Cesium development server running locally.  Connect to http://'+hostAddress+':%d/', server.address().port);
        }
    });

    server.on('error', function (e) {
        if (e.code === 'EADDRINUSE') {
            console.log('Error: Port %d is already in use, select a different port.', argv.port);
            console.log('Example: node server.js --port %d', argv.port + 1);
        } else if (e.code === 'EACCES') {
            console.log('Error: This process does not have permission to listen on port %d.', argv.port);
            if (argv.port < 1024) {
                console.log('Try a port number higher than 1024.');
            }
        }
        console.log(e);
        process.exit(1);
    });

    server.on('close', function () {
        console.log('Cesium development server stopped.');
    });

    var isFirstSig = true;
    process.on('SIGINT', function () {
        if (isFirstSig) {
            console.log('Cesium development server shutting down.');
            server.close(function () {
                process.exit(0);
            });
            isFirstSig = false;
        } else {
            console.log('Cesium development server force kill.');
            process.exit(1);
        }
    });

})();
