'use strict';

const net = require('node:net');

const normalize = value => {
  const text = String(value || '').trim().replace(/^\[|\]$/g, '');
  if (!net.isIP(text)) return '';
  return text.startsWith('::ffff:') ? text.slice(7) : text;
};

function parseNetwork(value) {
  const [rawAddress, rawPrefix] = String(value).trim().split('/');
  const address = normalize(rawAddress);
  if (!address) return null;
  const version = net.isIP(address);
  const bits = version === 4 ? 32 : 128;
  const prefix = rawPrefix === undefined ? bits : Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) return null;
  return { address, version, prefix, bytes: ipBytes(address) };
}

function ipBytes(address) {
  if (net.isIP(address) === 4) return Buffer.from(address.split('.').map(Number));
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = left.length + right.length;
  const expanded = address.includes('::') ? [...left, ...Array(8 - groups).fill('0'), ...right] : left;
  return Buffer.concat(expanded.map(group => Buffer.from(group.padStart(4, '0').slice(-4), 'hex')));
}

function contains(network, address) {
  if (network.version !== net.isIP(address)) return false;
  const bytes = ipBytes(address);
  const fullBytes = Math.floor(network.prefix / 8);
  const remainder = network.prefix % 8;
  for (let i = 0; i < fullBytes; i++) if (bytes[i] !== network.bytes[i]) return false;
  return !remainder || (bytes[fullBytes] & (0xff << (8 - remainder))) === (network.bytes[fullBytes] & (0xff << (8 - remainder)));
}

function createClientIp({ trustProxy = false, trustedProxyIps = [] } = {}) {
  const configured = trustedProxyIps.map(parseNetwork).filter(Boolean);
  const networks = configured.length ? configured : [
    { address: '127.0.0.0/8', version: 4, prefix: 8, bytes: Buffer.from([127, 0, 0, 0]) },
    { address: '::1', version: 6, prefix: 128, bytes: ipBytes('::1') }
  ];
  const isTrusted = address => networks.some(network => contains(network, address));

  return req => {
    const peer = normalize(req.socket && req.socket.remoteAddress);
    if (!peer || !trustProxy || !isTrusted(peer)) return peer;
    const forwarded = String((req.headers && req.headers['x-forwarded-for']) || '').split(',').map(normalize).filter(Boolean);
    let index = forwarded.length - 1;
    let hop = peer;
    while (index >= 0 && hop && isTrusted(hop)) hop = forwarded[index--];
    return hop || peer;
  };
}

module.exports = { createClientIp, parseNetwork };
