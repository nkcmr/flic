var _ = require("lodash")
	, uuid = require("uuid");

function Message(type, data){
	if(!_.isString(type))
		throw new Error("Message 'type' must be a string");
 
	this.id = uuid.v4();
	this.type = type;
	this.data = _.isArray(data) ? data : [];

	return this;
}

Message.prototype.getId = function() {
	return this.id;
};

Message.prototype.setSlaveName = function(slaveName) {
	this.slaveName = slaveName;
};

Message.prototype.toString = function() {
	var out = {
		id: this.id,
		type: this.type,
		data: this.data
	};

	if(this.slaveName)
		out.slaveName = this.slaveName;

	return JSON.stringify(out);
};

module.exports = Message;