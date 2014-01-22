/**
 *  flic
 *  Written by: Nick Comer <nick@comer.io> (http://nick.comer.io)
 *  Licensed under MIT
 */

var net = require("net")
	, util = require("util")
	, events = require("events")
	, debug = require("debug")("flic")
	, _ = require("lodash")
	, Message = require("./flic-message.js");

// slave1 --[SLAVE_TELL(slave_name, slave_event, params...)]-> master --[SLAVE_EVENT(from, callback_id, event_name, params)]-> slave2
// 	||																													||	  <-[EVENT_CALLBACK(to, callback_id, params)]-------------   ||
//	||	 <-[MSG_ACK(callback_id, params...)]-----------------   ||									

const SLAVE_TELL = "slave_tell";
// when going to master
// [0] slave name
// [1] slave event
// [2] array of params

const SLAVE_EVENT = "slave_event";
// [0] sent from which slave
// [1] callback id
// [2] event name
// [3] array of params

const EVENT_CALLBACK = "event_callback";

const SLAVE_IDENT = "slave_ident";
// NOTE: slaveName can be attached to the message instead of having to be placed
// in the data array.

const MSG_ACK = "message_ack";
// [0] the id of the message that is being acknowledged
// [1] array of args
// 
// NOTE: MSG_ACK should never EVER be sent to Master, this might results in a
// callback loop.

function Master(port){
	var self = this;
	if(!_.isNumber(port)) port = 8221;

	self.sockets = {};
	self.server = net.createServer(function(socket){
		debug("Master - new slave");

		socket.on("data", function(message){

			if(process.env.DEBUG_FLIC){
				debug("Slave --> Master: %s", message);
			}

			// message is a stringified JSON, let's parse it
			message = JSON.parse(message);

			// make sure that the message has a type
			if(message.hasOwnProperty("type") && _.isString(message.type)){
				switch(message.type){
					case SLAVE_IDENT:
						debug("Master - Received SLAVE_IDENT from %s", message.slaveName);

						// Check if slave name is already taken
						if(!!self.sockets[message.slaveName]){
							debug("Duplicate slave name: %s", message.slaveName);
							var err = new Error("Duplicate slave name!");
							var ack_w_err = new Message(MSG_ACK, [message.id, [err]]);
							socket.write(ack_w_err.toString());
							return;
						}

						// Save socket to list of sockets!
						self.sockets[message.slaveName] = socket;

						// Create MSG_ACK message
						var ack = new Message(MSG_ACK, [message.id, [null]]);

						// Send that bitch
						debug("Master - Sending MSG_ACK (id: %s)", message.id);
						self.sockets[message.slaveName].write(ack.toString());

						break;
					case SLAVE_TELL:
						debug("Master - Received SLAVE_TELL from %s", message.slaveName);

						if(!self.sockets[message.data[0]]){
							debug("Attempting to tell a non-existent slave: %s", message.data[0]);
							var err = new Error("Attempting to tell non-existent slave");
							var ack_w_err = new Message(MSG_ACK, [message.id, [err]]);
							self.sockets[message.slaveName].write(ack_w_err.toString());
							return;
						}

						// Okay so the slave exists, lets prepare a message
						
						var msg = new Message(SLAVE_EVENT, [message.slaveName, message.id, message.data[1], message.data[2]]);

						self.sockets[message.data[0]].write(msg.toString());
						break;
					case EVENT_CALLBACK:
						debug("Master - Received EVENT_CALLBACK from %s", message.slaveName);
						var to = message.data[0]
							, callback_id = message.data[1]
							, params = message.data[2]
							, msg;

						var msg = new Message(MSG_ACK, [callback_id, params]);

						self.sockets[to].write(msg.toString());
						break;
					default:
						debug("Master received unrecognized command");
				}
			}
		});
	}).listen(port, function(){
		debug("Master - listening on port %d", port);
	});
}

function Slave(name, port, callback){
	/*
	TODO:
	- if disconnected from Master attempt to reconnect
	 */

	var self = this;

	// Set slave name
	if(!_.isString(name) && !name.match(/^[a-zA-Z|_|$][a-zA-Z0-9|_|$]*$/))
		throw new Error("Slave must have a valid name");
	else
		self.slaveName = name;

	// Make sure we have a valid port number
	if(!_.isNumber(port)) port = 8221;

	// Set up an array to store waiting callbacks
	self.waiters = {};

	// Lets connect to the Master
	self.master = net.connect(port, function(){

		// Identify the slave to the master
		debug("Slave  - sending SLAVE_IDENT");
		
		// Create a new Message
		var ident = new Message(SLAVE_IDENT);

		// Attach the slave name
		ident.setSlaveName(self.slaveName);

		// Get the ID of the message so we can store the callback as a waiter
		var message_id = ident.getId();

		// store the callback in the waiters list
		self.waiters[message_id] = callback;

		// tell the master
		self.master.write(ident.toString());
	});

	self.master.on("data", function(message){

		if(process.env.DEBUG_FLIC){
			debug("Slave <-- Master: %s", message);
		}

		// message is a stringified JSON, let's parse it
		message = JSON.parse(message);

		if(message.hasOwnProperty("type")) {
			switch(message.type){
				case MSG_ACK:
					debug("Slave  - Received MSG_ACK from Master for message: %s", message.data[0]);
					// Save the message ack id - we'll be plucking it from the array later.
					var mid = message.data[0];
					if(self.waiters.hasOwnProperty(mid)){
						var callback = self.waiters[mid];

						if(_.isFunction(callback)){
							var args = message.data[1];

							callback.apply(self, args);

							debug("Slave  - removing callback %s from waiters", mid);
							delete self.waiters[mid];
						}
					}
					break;
				case SLAVE_EVENT:
					var from = message.data[0]
						, callback_id = message.data[1]
						, event_name = message.data[2]
						, params = message.data[3];

					// Define a callback function that can be called by a receiving function
					var cb = function(){
						// Grab all the args
						var args = Array.prototype.slice.call(arguments);

						// construct the message
						var msg = new Message(EVENT_CALLBACK, [from, callback_id, args]);

						// set a slave name just for kicks i guess
						msg.setSlaveName(self.slaveName);

						// send that mo-fucka
						self.master.write(msg.toString());
					};

					// push the callback to the end of the params array
					params.push(cb);

					// push the event name to the beginning
					params.unshift(event_name);

					// emit that sunuva-bitch
					self.emit.apply(self, params);
			}
		}

	});

	self.master.on("error", function(e){
		callback(err);
	});
}
util.inherits(Slave, events.EventEmitter);

/**
 * Slave.tell - Send an event to a remote slave w/ data
 * @param {string} who_what "slave_name:event_name" a string 
 * @param (who_what) - {string} 
 * @param {args} args - any amount of arguments that need to be sent to the event
 * @param {function} callback - a callback function if the slave decideds to reply
 * @return {null}
 */
Slave.prototype.tell = function() {
	var self, args, who_what, callback, tell_message, mid;

	self = this;
	args = Array.prototype.slice.call(arguments);
	who_what = args.shift();
	if(_.isFunction(args[args.length - 1])){
		callback = args.pop();
	}

	if(!(_.isString(who_what) && who_what.match(/^[a-zA-Z0-9|_|$]*:[a-zA-Z0-9|_|$]*$/)))
		throw new Error("Invalid tell statment");

	var i = who_what.indexOf(":");
	var slaveName = who_what.substring(0, i);
	var eventName = who_what.substring(i + 1);

	var destination = [slaveName, eventName, args];

	tell_message = new Message(SLAVE_TELL, destination);
	tell_message.setSlaveName(self.slaveName);

	if(!!callback){
		mid = tell_message.getId();
		self.waiters[mid] = callback;
	}

	self.master.write(tell_message.toString());
}

module.exports = {
	Master: Master,
	Slave: Slave
};
