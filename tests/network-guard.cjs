const net = require("node:net");
const dns = require("node:dns");

function blocked() {
  throw new Error("Network guard blocked outbound network during replay");
}

net.connect = blocked;
net.createConnection = blocked;
dns.lookup = blocked;
dns.resolve = blocked;
dns.resolve4 = blocked;
dns.resolve6 = blocked;
