var TestCase = mozlab.mozunit.TestCase;
var assert = mozlab.mozunit.assertions;

var tc = new TestCase('vimperator testcase description here');

//var vimperator = new Vimperator();

tc.tests = {
    'First test is successful': function() {
        assert.isTrue(true);
    },

	'Checking a working echo()': function() {
		assert.isTrue(vimperator.echo("test"));
	},
	'Checking the non working ex.echo()': function() {
		assert.isTrue(vimperator.ex.echo("test"));
	}
}
