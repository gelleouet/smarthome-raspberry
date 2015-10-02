/**
 * Envoi d'un message à l'arduino
 */
var checksum = function(value) {
	var sum = 0;
	var j
	
	for (j=0; j < value.length-2; j++) {
		sum += value.charCodeAt(j);
	}
	
	sum = (sum & 63) + 32;
	console.log("checksum:", sum, value.charCodeAt(j+1), (sum == value.charCodeAt(j+1)), data);
	
	return (sum == value.charCodeAt(j+1));
};

checksum("MOTDETAT 000000 B");
