//height level file system
//高级文件系统操作API
//by 司徒正美 
//微博 http://weibo.com/jslouvre 
//博客 http://www.cnblogs.com/rubylouvre/
//抽取自我另一个项目中的一个模块 https://github.com/RubyLouvre/newland/blob/master/system/hfs.js
    // console.log("已加载了hfs模块")
	var fs = require("fs");
	var path = require("path")
	var $ = $ || {}
	$.mix = function( receiver, supplier ){
        var args = Array.apply([], arguments ),i = 1, key,//如果最后参数是布尔，判定是否覆写同名属性
        ride = typeof args[args.length - 1] == "boolean" ? args.pop() : true;
        if(args.length === 1){//处理$.mix(hash)的情形
            receiver = !this.window ? this : {} ;
            i = 0;
        }
        while((supplier = args[i++])){
            for ( key in supplier ) {//允许对象糅杂，用户保证都是对象
                if (supplier.hasOwnProperty(key) && (ride || !(key in receiver))) {
                    receiver[ key ] = supplier[ key ];
                }
            }
        }
        return receiver;
    };
    $.mix( {
        //遍历文件树,收集目录与文件,并包含自身
        //p为路径，
        //cb为最终回调，它将接受两个参数files, dirs，所有文件列表与所有目录列表
        //opts为可选的配置对象，里面参数：
        //sync  表示是否同步，
        //one   表示是否找到一个就终于遍历
        //filter表示过滤函数，如果函数返回true则收录
        walk: new function  (){
            function collect(opts, el, prop){
                if((typeof opts.filter == "function") ? opts.filter( el ) : true){
                    opts[prop].push( el );
                    if(opts.one === true){
                        opts.filter = function(){
                            return false
                        };
                        opts.count = 0;
                    }
                }
            }
            function sync( p, opts){
                try{
                    var stat = fs.statSync( p );
                    var prop = stat.isDirectory() ? "dirs" : "files";
                    collect(opts, p, prop );
                    if( prop === "dirs"){
                        var array = fs.readdirSync( p );
                        for(var i = 0, n = array.length; i < n; i++ ){
                            sync( path.join( p , array[i]), opts )
                        }
                    }
                }catch(e){ }
            }
            function async( p, opts ){
                opts.count++
                fs.stat(p, function(e, s){
                    opts.count--
                    if(!e){
                        if( s.isDirectory() ){
                            collect(opts, p, "dirs");
                            opts.count++
                            fs.readdir( p, function(e, array){
                                opts.count--;
                                for(var i = 0, n = array.length; i < n; i++ ){
                                    async( path.join( p , array[i]), opts )
                                }
                                if(opts.count == 0){
                                    opts.cb(opts.files, opts.dirs)
                                }
                            });
                        }else{
                            collect(opts, p, "files");
                        }
                        if(opts.count == 0){
                            opts.cb(opts.files, opts.dirs)
                        }
                    }
                    if(e && e.code == "ENOENT"){
                        opts.cb(opts.files, opts.dirs)
                    }
                });
            }
            return function( p, cb, opts ){
                if(typeof cb == "object"){
                    opts = cb
                    cb = opts.cb;
                }
                opts = opts ||{}
                opts.files = [];
                opts.dirs = [];
                opts.cb = typeof cb === "function" ? cb : $.noop
                opts.count = 0;
                if(opts.sync){
                    sync( path.normalize(p), opts );
                    opts.cb(opts.files, opts.dirs)
                }else{
                    async( path.normalize(p), opts );
                }
            }
        },
        //删除文件或目录,如果里面有东西,也一并清空,这是同步化版本
        delSync: function(p, cb){
            $.walk(p, {
                cb: function( files, dirs ){
                    var c = 0
                    while((c = files.shift())){
                        try{
                            fs.rmdirSync(c)
                        } catch(e){}
                    }
                    while((c = dirs.pop())){
                        try{
                            fs.rmdirSync(c)
                        } catch(e){}
                    }
                },
                sync: true
            });
            if(typeof cb == "function" ){
                cb()
            }
        },
        //上面的异步化版本
        del: new function( ){
            function inner(dirs, cb){
                var dir = dirs.pop();
                if(dir){
                    fs.rmdir(dir, function(e){
                        inner(dirs, cb);
                    })
                }else{
                    cb()
                }
            }
            return function( p, cb ){
                $.walk(p, function( files, dirs ){
                    var c = files.length, n = c;
                    if( n ){
                        for(var i = 0 ; i < n ; i++){//先删除文件再从最深处起往外删除目录
                            fs.unlink(files[i], function(e){
                                c--
                                if(c == 0){
                                    inner(dirs, cb)
                                }
                            })
                        }
                    }else{//如果不存在文件
                        inner(dirs, cb)
                    }
                });
            }
        },
        //创建目录,如果指定路径中有许多中间的目录不存在,也一并创建它们
        mkdirSync: function(p){
            p = path.normalize(p);
            var array = p.split( path.sep );//创建目录,没有则补上
            for(var i = 0, cur; i < array.length; i++){
                if(i == 0){
                    cur = array[i];
                }else{
                    cur += (path.sep + array[i]);
                }
                try{
                    fs.mkdirSync(cur, "0755");
                }catch(e){}
            }
        },
        //上面的异步化版本
        mkdir: function(p, cb){
            p = path.normalize(p);
            var array = p.split( path.sep );
            function inner(dir, array, cb ){
                dir  += (!dir ? array.shift() :  path.sep + array.shift());
                fs.mkdir(dir, "0755", function(){
                    if(array.length){//忽略EEXIST错误
                        inner(dir ,array, cb);
                    }else if(typeof cb === "function"){
                        cb();
                    }
                });
            }
            inner("", array, cb)
        },
        //读取某个文件的内容
        readFile: function(){
            fs.readFile.apply(fs, arguments)
        },
        readFileSync: function(){
            return fs.readFileSync.apply(fs, arguments)
        },

        //创建文件,并添加内容,如果指定的路径中里面某些目录不存在,也一并创建它们
        writeFileSync: function( p , data, encoding){
            p = path.normalize(p);
            var i = p.lastIndexOf(path.sep)
            var dir = p.slice(0, i);
            if(dir){
                $.mkdirSync(dir, "0755" )
            }
            fs.writeFileSync( p, data, encoding || "utf-8")
        },
        //上面的异步化版本
        writeFile: function(p, data, cb){
            p = path.normalize(p);cb = cb || $.noop
            var i = p.lastIndexOf( path.sep )
            var dir = p.slice(0, i);
            var fn  = function(){
                fs.writeFile( p, data, "utf-8", cb)
            }
            dir ? $.mkdir(dir, fn) : fn();
        },
        //比较两个文件的内容,如果前者与后者不一致,则用后者的更新前者,前两个参数为它们的路径名
        updateFileSync: function(target_path, source_path){
            var source = fs.statSync.readFile(source_path,"utf-8");
            var update = true;
            try{
                var stat = fs.statSync(target_path);
                if(stat.isFile()){
                    var target = fs.statSync.readFile(source_path,"utf-8");
                    if(source+"" == target+""){
                        update = false;
                    }
                }
            }catch(e){};
            if( update && target ){
                $.writeFileSync(target_path, source, "utf-8");
            }
        },
         //上面的异步化版本
        updateFile: function(target_path, source_path, cb){
            var pending = 2, object = {}
            function callback(){
                if(!pending){
                    if(object.err || object.target != object.source){
                        $.writeFile(target_path, object.source, cb);
                    }
                }
            }
            fs.readFile(target_path, "utf-8", function(e, data ){
                pending--;
                if(e){
                    object.err = true;
                }else{
                    object.target = data + "";
                }
                callback()
            })
            fs.readFile(source_path, "utf-8", function(e, data){
                pending--;
                if(e){
                    cb(e)
                }else{
                    object.source = data + "";
                }
                callback();
            })
        },
        //目录对拷,可以跨分区拷贝
        cpdirSync: new function(old, neo, cb) {
            function inner( old, neo ) {
                var array = fs.readdirSync(old);
                for(var i  = 0 , n = array.length; i < n ; i++){
                    var source = array[i]
                    var target = path.join( neo, source.replace(old,"") )
                    var stat = fs.statSync( source );//判定旧的IO对象的属性，是目录还是文件或是快捷方式
                    if(stat.isDirectory()){
                        inner( source, target )
                    }else if(stat.isSymbolicLink()){
                        fs.symlinkSync( fs.readlinkSync( source ),target);
                    }else {
                        fs.writeFileSync( target, fs.readFileSync( source) );
                    }
                }
            }
            return function(old, neo, cb){//把当前目录里面的东西拷贝到新目录下（不存在就创建）
                old = path.resolve(process.cwd(), old);
                neo = path.resolve(process.cwd(), neo);//允许拷贝到另一个分区中
                if(!fs.existsSync(neo)){//创建新文件
                    $.mkdirSync( neo )
                }
                inner(old, neo);
                if(typeof cb == "function" ){
                    cb()
                }
            }
        },
        //上面的异步化版本
        cpdir: new function(){
            function copyFile(file, newFile, after ){
                fs.stat(file, function(err, stat){//拷贝快捷方式与文件
                    if (stat.isSymbolicLink())
                        fs.readlink(file, function(err, link){
                            fs.symlink(link, newFile, after);
                        });
                    else
                        fs.readFile(file, function(err, data){
                            fs.writeFile(newFile, data, after);
                        });
                });
            }
            function copyFiles(files, old, neo, after){
                for(var i  = 0 , n = files.length, c = n; i < n ; i++){
                    var p = path.join( neo,  files[i].replace(old,"") )
                    copyFile(files[i], p, function(){
                        c--;
                        if(c == 0){
                            after()
                        }
                    })
                }
            }
            return function(old, neo, cb){//把当前目录里面的东西拷贝到新目录下（不存在就创建）
                cb = typeof cb == "function" ? cb : $.noop
                old = path.resolve(process.cwd(), old);
                neo = path.resolve(process.cwd(), neo);//允许拷贝到另一个分区中
                $.mkdir(neo, function(){
                    $.walk(old, function( files, dirs ){
                        var n = dirs.length
                        if( n ){//如果存在目录
                            for(var i  = 0 , c = n; i < n ; i++){
                                var p = path.join(neo,  dirs[i].replace(old,""))
                                $.mkdir(p, function(){
                                    c--
                                    if(c == 0){//目录拷贝完毕
                                        copyFiles(files, old, neo, cb)
                                    }
                                })
                            }
                        }else if(files.length){//如果不存在目录但存在文件
                            copyFiles(files, old, neo, cb)
                        }else{
                            cb()
                        };
                    });
                })
            }
        }

    });
	
	exports.$ = $;