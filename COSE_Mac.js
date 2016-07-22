var cbor = require('cbor');
var crypto = require('crypto');
var Q = require('q');

var alg_tags = {
  "SHA-256-64":4,
  "SHA-256":5,
  "SHA-384":6,
  "SHA-512":7
}

var header_parameters = {
  "alg": 1,
  "crit": 2,
  "content_type": 3,
  "kid": 4,
  "IV": 5,
  "Partial_IV": 6,
  "counter_signature": 7
};

// TODO content type map?


exports.create = function(prot_in, unprotected, payload, key, external_aad) {
  var deferred = Q.defer();
  external_aad = external_aad || null;
  var protected = new Map();

  for(var param in prot_in) {
     if(!header_parameters[param]) {
       return deferred.reject(new Error("Unknown parameter, " + param));
     }
     protected.set(header_parameters[param], prot_in[param]);
  }

  if(prot_in.alg && alg_tags[prot_in.alg]) {
      protected.set(header_parameters.alg, alg_tags[prot_in.alg]);
  } else {
      // TODO return better error
      return deferred.reject(new Error("Alg is mandatory and must have a known value"));
  }

  // TODO check crit headers

  var MAC_structure = [
          "MAC0", // context
          protected, // protected
          external_aad, // bstr,
          payload]; //bstr

  var ToBeMaced = cbor.encode(MAC_structure)
  console.log("ToBeMaced in: " + ToBeMaced.toString("hex"));
  var hmac = crypto.createHmac("sha256", key);// TODO make algorithm dynamic
  hmac.end(ToBeMaced, function () {
    var tag = hmac.read();
    console.log("tag in: " + tag.toString("hex"));
    var encoded = cbor.encode([protected, unprotected, payload, tag]);
    deferred.resolve(encoded);
  });
  return deferred.promise;
}

exports.read = function(data, key, external_aad) {
  var deferred = Q.defer();
  external_aad = external_aad || null;

  cbor.decodeAll(data, function(error, obj) {
    if(error) {
      return deferred.reject(new Error("Failed to CBOR decode input"));
    }

    if(obj[0] && obj[0].length !== 4) {
      return deferred.reject(new Error("invalid COSE_Mac structure"));
    }
    obj = obj[0];
    var protected = obj[0];
    var unprotected = obj[1];
    var payload = obj[2];
    var tag = obj[3];

    // TODO validate protected header

    var MAC_structure = [
            "MAC0", // context
            protected, // protected
            external_aad, // bstr,
            payload]; //bstr
    var ToBeMaced = cbor.encode(MAC_structure);
    var hmac = crypto.createHmac("sha256", key); // TODO make algorithm dynamic
    hmac.end(ToBeMaced, function () {
      var calc_tag = hmac.read();
      console.log("calc_tag out: " + calc_tag.toString("hex"));

      if (tag.toString("hex") !== calc_tag.toString("hex")) { // TODO find a better way to compare
        return deferred.reject(new Error("Tag mismatch"));
      }

      deferred.resolve(payload);
    });
    // obj is the unpacked object
  });
  return deferred.promise;
}
