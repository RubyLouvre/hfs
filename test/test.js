//2012.9.8 优化readFileSync
//扼要测试代码
var hfs = require('../hfs'),
path = require('path'),
fs = require('fs');
var cp = function(src, dst, callback) { //将一个文件的内容拷到另一个文件中，如果原来有东西，将被清掉再拷
	var is = fs.createReadStream(src); //因此这方法只用于文件间的内容转移
	var os = fs.createWriteStream(dst); //使用之前，要自己确保这两个文件是否存在
	require("util").pump(is, os, callback);
};

var a = 1;

switch (a) {
case 1:
	//create
	hfs.writeFile("files/45643/aara/test.js", 'alert(88)', function() {
		hfs.writeFile("files/45643/aaa.js", "alert(1)", function() {
			console.log("创建文件与目录成功");
		});
	});
	hfs.mkdir("aaerewr", function() {
		console.log("创建目录成功");
	});
	break;
case 2:
	//walk
	hfs.walk("files", {
		cb: function(files, dirs) {
			console.log(files);
			console.log(dirs);
			console.log("收集文件与目录，包括自身");
		},
		sync: true
	});
	break;
case 3:
	//delete
	hfs.remove("files", function(files, dirs) {
		console.log("删除文件与目录，包括自身");
	});
	hfs.remove("aaerewr", function(files, dirs) {
		console.log("删除文件与目录，包括自身");
	});
	break;
case 4:
	//copy 
	console.log(path.resolve(process.cwd(), "E:\\aaa.js") + "!");
	fs.writeFileSync("E:\\aaa.js", "alert(1)");
	cp("helpers.js", "neer/ee.txt", function() {
		console.log("ok");
	});
	hfs.cpdir("nbproject", "E:\\neer");
	break;
default:
	break;
}

fs.rmdir("files/45643/aara/", function() {
	console.log("rmdir ok");
});

