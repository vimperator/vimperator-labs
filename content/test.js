var TestCase = mozlab.mozunit.TestCase;
var assert = mozlab.mozunit.assertions;

var tc = new TestCase('testcase description here');

tc.tests = {
    'First test is successful': function() {
        var vimperator = new Vimperator();
        assert.isDefined(vimperator);
        assert.isTrue(true);
    }
}
tc.run()
