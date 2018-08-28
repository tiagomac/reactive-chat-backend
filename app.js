
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var redis = require('redis').createClient('redis://104.154.69.20:6379');
var crypto = require('crypto')
, md5 = crypto.createHash('md5');
var objContato = "contatosChat";
app.get('/', function(req, res){
  res.sendfile('index.html');
});
app.get('/listaContatos', function(req, res){
    redis.lrange(objContato, 0, -1, function(erro, contatos) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "X-Requested-With");
		res.send(contatos);
	});
});
onlines = [];	
io.on('connection', function(client){
	
	function gerarNomeSala(nome1, nome2){
		if( nome1 > nome2){
			return nome2 + nome1;
		}else{
			return nome1 + nome2;
		}
	}
	
	function consultarIdUsuario(nome){
		 for(i = 0 ; i < onlines.length ; i++){
			if( onlines[i] != null && onlines[i].nome === nome ){
				return onlines[i].id;
			}
		}
		return "0";
	}
	
	function addUsuario(nome){
		redis.lrange(objContato, 0, -1, function(erro, contatos) {		
			var achou = false;
			contatos.forEach(function(contato){				
				if( contato == nome ){
					achou = true;
				}				
			});
			
			if( !achou ){
				redis.rpush(objContato, nome); 
			}
			
		});
	}
	
	var nomeUsuario = '';
	//ok
	client.on('addUser', function(nome){
		onlines.push({nome:nome, id:client.id});
		addUsuario(nome);
		nomeUsuario = nome;
		onlines.forEach(function(online) {
			client.emit('notify-onlines', online.nome);
			client.broadcast.emit('notify-onlines', online.nome);		
		});
		var chave = 'off_'+nome;
		redis.lrange(chave, 0, -1, function(erro, datas){
			datas.forEach(function(data){
				client.emit('new-message', {nome: data});
			});
			
			redis.del('off_'+nome);
		});
	});	
		
	//nome da sala, nome do contato da conversa, nome do usu�rio logado
	client.on('join', function(sala,contato,nome) {
		if(!sala) {
			var nomeSala = gerarNomeSala(nome, contato);
			var md5 = crypto.createHash('md5');
			sala = md5.update(nomeSala).digest('hex');
		}
		client.join(sala);
		var idUsuario = consultarIdUsuario(nome);
		redis.lrange(sala, 0, -1, function(erro, msgs) {
			msgs.forEach(function(msg){
				io.sockets.connected[idUsuario].emit('send-client', msg);
			});
		});
	});
	
	client.on('closeConnection', function () {
		client.disconnect();
	});
	
	//ok	
	client.on('disconnect', function () {
		 client.broadcast.emit('notify-offlines', nomeUsuario);
		 for(i = 0 ; i < onlines.length ; i++){
			if( onlines[i] != null && onlines[i].nome === nomeUsuario ){
				delete onlines[i];
			}
		}
		
	});
	
	//ok
    client.on('send-server', function (msg, data) {
		  var idContato = consultarIdUsuario(data.contato);
		  msg = "<b>"+data.nome+":</b> "+msg;
		  if( idContato != "0" ){
			io.sockets.connected[idContato].emit('new-message', data);
		  }else{
			redis.rpush('off_'+data.contato, data.nome); 	
		  }
		  io.in(data.sala).emit('send-client', msg);
		  redis.rpush(data.sala, msg); 	
	});
	
	client.on('list-contatos',function(){
		redis.lrange(objContato, 0, -1, function(erro, contatos) {
			io.emit('send-list-contatos',contatos);
		});
	});
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});