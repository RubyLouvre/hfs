﻿//height level file system
//高级文件系统操作API
//by 司徒正美 
//微博 http://weibo.com/jslouvre 
//博客 http://www.cnblogs.com/rubylouvre/
//抽取自我另一个项目中的一个模块 https://github.com/RubyLouvre/newland/blob/master/system/hfs.js
//欢迎指正与使用！
var fs = require("fs");
var path = require("path");
var $ = $ || {};
var encodings = {
	ascii: 1,
	utf8: 1,
	utf16le: 1,
	ucs2: 1,
	base64: 1,
	binary: 1,
	hex: 1,
	append: 2,
	sync: 3
};
$.mix = function(receiver, supplier) {
	var args = Array.apply([], arguments),
	i = 1,
	key,
	//如果最后参数是布尔，判定是否覆写同名属性
	ride = typeof args[args.length - 1] == "boolean" ? args.pop() : true;
	if (args.length === 1) { //处理$.mix(hash)的情形
		receiver = ! this.window ? this: {};
		i = 0;
	}
	while ((supplier = args[i])) {
		i++;
		for (key in supplier) { //允许对象糅杂，用户保证都是对象
			if (supplier.hasOwnProperty(key) && (ride || ! (key in receiver))) {
				receiver[key] = supplier[key];
			}
		}
	}
	return receiver;
};
$.mix({
	noop: function() {},
	createWriteStream: fs.createWriteStream,
	createReadStream: fs.createReadStream,
	//读取某个文件的内容
	readFile: function() {
		fs.readFile.apply(fs, arguments);
	},
	readFileSync: function() {
		//这里的注释与处理见https://github.com/joyent/node/blob/master/lib/module.js 459行
		// Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
		// because the buffer-to-string conversion in `fs.readFileSync()`
		// translates it to FEFF, the UTF-16 BOM.
		var content = fs.readFileSync.apply(fs, arguments);
		if (content.charCodeAt(0) === 0xFEFF) {
			content = content.slice(1);
		}
		return content;
	},
	//遍历文件树,收集目录与文件,并包含自身
	//p为路径，
	//cb为最终回调，它将接受两个参数files, dirs，所有文件列表与所有目录列表
	//opts为可选的配置对象，里面参数：
	//sync  表示是否同步，
	//one   表示是否找到一个就终于遍历
	//filter表示过滤函数，如果函数返回true则收录
	//$.walk(url, callback, { sync: true})
	walk: new function() {
		function collect(opts, el, prop) {
			if ((typeof opts.filter == "function") ? opts.filter(el) : true) {
				opts[prop].push(el);
				if (opts.one === true) {
					opts.filter = function() {
						return false;
					};
					opts.count = 0;
				}
			}
		}
		function sync(p, opts) {
			try {
				var stat = fs.statSync(p);
				var prop = stat.isDirectory() ? "dirs": "files";
				collect(opts, p, prop);
				if (prop === "dirs") {
					var array = fs.readdirSync(p);
					for (var i = 0, n = array.length; i < n; i++) {
						sync(path.join(p, array[i]), opts);
					}
				}
			} catch(e) {}
		}
		function async(p, opts) {
			opts.count++;
			fs.stat(p, function(e, s) {
				opts.count--;
				if (!e) {
					if (s.isDirectory()) {
						collect(opts, p, "dirs");
						opts.count++;
						fs.readdir(p, function(e, array) {
							opts.count--;
							for (var i = 0, n = array.length; i < n; i++) {
								async(path.join(p, array[i]), opts);
							}
							if (opts.count === 0) {
								opts.cb(opts.files, opts.dirs);
							}
						});
					} else {
						collect(opts, p, "files");
					}
					if (opts.count === 0) {
						opts.cb(opts.files, opts.dirs);
					}
				}
				if (e && e.code === "ENOENT") {
					opts.cb(opts.files, opts.dirs);
				}
			});
		}
		return function(p, cb, opts) {
			if (typeof cb == "object") {
				opts = cb;
				cb = opts.cb;
			}
			opts = opts || {};
			opts.files = [];
			opts.dirs = [];
			opts.cb = typeof cb === "function" ? cb: $.noop;
			opts.count = 0;
			if (opts.sync) {
				sync(path.normalize(p), opts);
				opts.cb(opts.files, opts.dirs);
			} else {
				async(path.normalize(p), opts);
			}
		};
	},
	//删除文件或目录,如果里面有东西,也一并清空,这是同步化版本
	/*
	参数
	p为目录或文件
	cn为回调函数
	*/
	delSync: function(p, cb) {
		$.walk(p, {
			cb: function(files, dirs) {
				var c = 0;
				while ((c = files.shift())) {
					try {
						fs.unlinkSync(c);
					} catch(e) {}
				}
				while ((c = dirs.pop())) {
					try {
						fs.rmdirSync(c);
					} catch(e) {}
				}
			},
			sync: true
		});
		if (typeof cb == "function") {
			cb();
		}
	},
	//上面的异步化版本
	/*
	参数
	p为目录或文件
	cn 可选 回调
	*/
	del: new function() {
		function inner(dirs, cb) {
			var dir = dirs.pop();
			if (dir) {
				fs.rmdir(dir, function(e) {
					inner(dirs, cb);
				});
			} else {
				cb();
			}
		}
		return function(p, cb) {
			$.walk(p, function(files, dirs) {
				var c = files.length,
				n = c;
				if (n) {
					files.forEach(function(file) {
						fs.unlink(file, function(e) { //先删除文件再从最深处起往外删除目录
							c--;
							if (c === 0) {
								inner(dirs, cb);
							}
						});
					});
				} else { //如果不存在文件
					inner(dirs, cb);
				}
			});
		};
	},
	//创建目录,如果指定路径中有许多中间的目录不存在,也一并创建它们
	/*
	参数
	p为一个目录的路径，以“/”隔开
	*/
	mkdirSync: function(p) {
		p = path.normalize(p);
		var array = p.split(path.sep); //创建目录,没有则补上
		for (var i = 0, cur; i < array.length; i++) {
			if (i === 0) {
				cur = array[i];
			} else {
				cur += (path.sep + array[i]);
			}
			try {
				fs.mkdirSync(cur, "0755");
			} catch(e) {}
		}
	},
	//上面的异步化版本
	/*
	参数
	p为一个目录的路径，以“/”隔开
	cb 可选，回调
	*/
	mkdir: function(p, cb) {
		p = path.normalize(p);
		var array = p.split(path.sep);
		function inner(dir, array, cb) {
			dir += (!dir ? array.shift() : path.sep + array.shift());
			fs.mkdir(dir, "0755", function() {
				if (array.length) { //忽略EEXIST错误
					inner(dir, array, cb);
				} else if (typeof cb === "function") {
					cb();
				}
			});
		}
		inner("", array, cb);
	},

	//创建文件,并添加内容,如果指定的路径中里面某些目录不存在,也一并创建它们
	//如果后两个参数中其中一个名为"append",那么它会直接在原文件上添加内容,而不是覆盖
	//相当于appendFileSync
	writeFileSync: function(p, data, encoding, append) {
		var args = Array.apply([], arguments);
		args.push("sync");
		$.writeFile.apply($, args);
	},
	//上面的同步化版本也是由它创建的,参数情况怕
	//p 路径 String,data要添加的内容 String,encoding编码,append标识是什么模式,cb最后的回调
	writeFile: function(p, data, encoding) {
		p = path.normalize(p);
		var i = p.lastIndexOf(path.sep);
		var dir = p.slice(0, i),
		append,
		sync;
		for (var j = 2; j < 5; j++) {
			var n = encodings[arguments[j]];
			if (n == 1) {
				encoding = arguments[j];
			} else if (n == 2) {
				append = true;
			} else if (n == 3) {
				sync = true;
			}
		}
		encoding = encoding || "utf8";
		var method = append ? "appendFile": "writeFile";
		var cb = arguments[arguments.length - 1];
		if (sync) {
			method += "Sync";
			if (dir) {
				$.mkdirSync(dir, "0755");
			}
			fs[method](p, data, encoding);
		} else {
			var fn = function() {
				fs[method](p, data, encoding, cb);
			};
			dir ? $.mkdir(dir, fn) : fn();
		}
	},
	//比较两个文件的内容,如果前者与后者不一致,则用后者的更新前者,前两个参数为它们的路径名
	//target_path:要更新的文件路径，
	//source_path:原文件的路径（或者原文件的内容，当第四个参数为真正的情况下),
	//isText:决定第二个参数是路径还是文本内容，如果是文本内容就不用再读取了
	updateFileSync: function(target_path, source_path, is_text) {
		var source = is_text ? source_path: $.readFileSync(source_path, "utf8");
		var update = true;
		try {
			var stat = fs.statSync(target_path);
			if (stat.isFile()) {
				var target = $.readFileSync(target_path, "utf8");
				if (source + "" == target + "") {
					update = false;
				}
			}
		} catch(e) {}
		if (update && target) {
			$.writeFileSync(target_path, source, "utf8");
		}
	},
	//上面的异步化版本，
	/*
         * var view_url = 'D:\newland\app\views\doc\query\query.attribute.html'
         * var page_url = view_url.replace("\\views","\\pages");
         *  $.updateFile(page_url, view_url, function(){
         *       $.log(page_url+"  同步完成")
         *  });
         */
	updateFile: function(target_path, source_path, cb, is_text) {
		var pending = 2,
		object = {};
		function callback() {
			if (!pending) {
				if (object.err || object.target != object.source) {
					$.writeFile(target_path, object.source, cb);
				}
			}
		}
		fs.readFile(target_path, "utf8", function(e, data) {
			pending--;
			if (e) {
				object.err = true; //如果不存在
			} else {
				object.target = data + "";
			}
			callback();
		});
		if (is_text) {
			pending--;
			object.source = source_path + "";
			callback();
		} else {
			fs.readFile(source_path, "utf8", function(e, data) {
				pending--;
				if (e) {
					cb(e);
				} else {
					object.source = data + "";
				}
				callback();
			});
		}

	},
	//目录对拷,可以跨分区拷贝
	cb	/*
	参数
	old为一个目录的路径，String,以“/”隔开
	neo为一个目录的路径，String,以“/”隔开
	cb 可选，回调	
	*/
	cpdirSync: new function(old, neo, cb) {
		function inner(old, neo) {
			var array = fs.readdirSync(old);
			for (var i = 0, n = array.length; i < n; i++) {
				var source = array[i];
				var target = path.join(neo, source.replace(old, ""));
				var stat = fs.statSync(source); //判定旧的IO对象的属性，是目录还是文件或是快捷方式
				if (stat.isDirectory()) {
					inner(source, target);
				} else if (stat.isSymbolicLink()) {
					fs.symlinkSync(fs.readlinkSync(source), target);
				} else {
					fs.writeFileSync(target, $.readFileSync(source));
				}
			}
		}
		return function(old, neo, cb) { //把当前目录里面的东西拷贝到新目录下（不存在就创建）
			old = path.resolve(process.cwd(), old);
			neo = path.resolve(process.cwd(), neo); //允许拷贝到另一个分区中
			if (!fs.existsSync(neo)) { //创建新文件
				$.mkdirSync(neo);
			}
			inner(old, neo);
			if (typeof cb == "function") {
				cb();
			}
		};
	},
	//上面的异步化版本
	cpdir: new function() {
		function copyFile(file, newFile, after) {
			fs.stat(file, function(err, stat) { //拷贝快捷方式与文件
				if (stat.isSymbolicLink()) fs.readlink(file, function(err, link) {
					fs.symlink(link, newFile, after);
				});
				else fs.readFile(file, function(err, data) {
					fs.writeFile(newFile, data, after);
				});
			});
		}
		function copyFiles(files, old, neo, after) {
			for (var i = 0, n = files.length, c = n; i < n; i++) {
				var p = path.join(neo, files[i].replace(old, ""));
				copyFile(files[i], p, function() {
					c--;
					if (c === 0) {
						after();
					}
				});
			}
		}
		return function(old, neo, cb) { //把当前目录里面的东西拷贝到新目录下（不存在就创建）
			cb = typeof cb == "function" ? cb: $.noop;
			old = path.resolve(process.cwd(), old);
			neo = path.resolve(process.cwd(), neo); //允许拷贝到另一个分区中
			$.mkdir(neo, function() {
				$.walk(old, function(files, dirs) {
					var n = dirs.length;
					if (n) { //如果存在目录
						for (var i = 0, c = n; i < n; i++) {
							var p = path.join(neo, dirs[i].replace(old, ""));
							$.mkdir(p, function() {
								c--;
								if (c === 0) { //目录拷贝完毕
									copyFiles(files, old, neo, cb);
								}
							});
						}
					} else if (files.length) { //如果不存在目录但存在文件
						copyFiles(files, old, neo, cb);
					} else {
						cb();
					}
				});
			});
		};
	}
});

module.exports = $;
