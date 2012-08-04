//height level file system
//�߼��ļ�ϵͳ����API
//by ˾ͽ���� 
//΢�� http://weibo.com/jslouvre 
//���� http://www.cnblogs.com/rubylouvre/
//��ȡ������һ����Ŀ�е�һ��ģ�� https://github.com/RubyLouvre/newland/blob/master/system/hfs.js
    // console.log("�Ѽ�����hfsģ��")
	var fs = require("fs");
	var path = require("path")
	var $ = $ || {}
	$.mix = function( receiver, supplier ){
        var args = Array.apply([], arguments ),i = 1, key,//����������ǲ������ж��Ƿ�дͬ������
        ride = typeof args[args.length - 1] == "boolean" ? args.pop() : true;
        if(args.length === 1){//����$.mix(hash)������
            receiver = !this.window ? this : {} ;
            i = 0;
        }
        while((supplier = args[i++])){
            for ( key in supplier ) {//����������ӣ��û���֤���Ƕ���
                if (supplier.hasOwnProperty(key) && (ride || !(key in receiver))) {
                    receiver[ key ] = supplier[ key ];
                }
            }
        }
        return receiver;
    };
    $.mix( {
        //�����ļ���,�ռ�Ŀ¼���ļ�,����������
        //pΪ·����
        //cbΪ���ջص�������������������files, dirs�������ļ��б�������Ŀ¼�б�
        //optsΪ��ѡ�����ö������������
        //sync  ��ʾ�Ƿ�ͬ����
        //one   ��ʾ�Ƿ��ҵ�һ�������ڱ���
        //filter��ʾ���˺����������������true����¼
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
        //ɾ���ļ���Ŀ¼,��������ж���,Ҳһ�����,����ͬ�����汾
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
        //������첽���汾
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
                        for(var i = 0 ; i < n ; i++){//��ɾ���ļ��ٴ����������ɾ��Ŀ¼
                            fs.unlink(files[i], function(e){
                                c--
                                if(c == 0){
                                    inner(dirs, cb)
                                }
                            })
                        }
                    }else{//����������ļ�
                        inner(dirs, cb)
                    }
                });
            }
        },
        //����Ŀ¼,���ָ��·����������м��Ŀ¼������,Ҳһ����������
        mkdirSync: function(p){
            p = path.normalize(p);
            var array = p.split( path.sep );//����Ŀ¼,û������
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
        //������첽���汾
        mkdir: function(p, cb){
            p = path.normalize(p);
            var array = p.split( path.sep );
            function inner(dir, array, cb ){
                dir  += (!dir ? array.shift() :  path.sep + array.shift());
                fs.mkdir(dir, "0755", function(){
                    if(array.length){//����EEXIST����
                        inner(dir ,array, cb);
                    }else if(typeof cb === "function"){
                        cb();
                    }
                });
            }
            inner("", array, cb)
        },
        //��ȡĳ���ļ�������
        readFile: function(){
            fs.readFile.apply(fs, arguments)
        },
        readFileSync: function(){
            return fs.readFileSync.apply(fs, arguments)
        },

        //�����ļ�,���������,���ָ����·��������ĳЩĿ¼������,Ҳһ����������
        writeFileSync: function( p , data, encoding){
            p = path.normalize(p);
            var i = p.lastIndexOf(path.sep)
            var dir = p.slice(0, i);
            if(dir){
                $.mkdirSync(dir, "0755" )
            }
            fs.writeFileSync( p, data, encoding || "utf-8")
        },
        //������첽���汾
        writeFile: function(p, data, cb){
            p = path.normalize(p);cb = cb || $.noop
            var i = p.lastIndexOf( path.sep )
            var dir = p.slice(0, i);
            var fn  = function(){
                fs.writeFile( p, data, "utf-8", cb)
            }
            dir ? $.mkdir(dir, fn) : fn();
        },
        //�Ƚ������ļ�������,���ǰ������߲�һ��,���ú��ߵĸ���ǰ��,ǰ��������Ϊ���ǵ�·����
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
         //������첽���汾
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
        //Ŀ¼�Կ�,���Կ��������
        cpdirSync: new function(old, neo, cb) {
            function inner( old, neo ) {
                var array = fs.readdirSync(old);
                for(var i  = 0 , n = array.length; i < n ; i++){
                    var source = array[i]
                    var target = path.join( neo, source.replace(old,"") )
                    var stat = fs.statSync( source );//�ж��ɵ�IO��������ԣ���Ŀ¼�����ļ����ǿ�ݷ�ʽ
                    if(stat.isDirectory()){
                        inner( source, target )
                    }else if(stat.isSymbolicLink()){
                        fs.symlinkSync( fs.readlinkSync( source ),target);
                    }else {
                        fs.writeFileSync( target, fs.readFileSync( source) );
                    }
                }
            }
            return function(old, neo, cb){//�ѵ�ǰĿ¼����Ķ�����������Ŀ¼�£������ھʹ�����
                old = path.resolve(process.cwd(), old);
                neo = path.resolve(process.cwd(), neo);//����������һ��������
                if(!fs.existsSync(neo)){//�������ļ�
                    $.mkdirSync( neo )
                }
                inner(old, neo);
                if(typeof cb == "function" ){
                    cb()
                }
            }
        },
        //������첽���汾
        cpdir: new function(){
            function copyFile(file, newFile, after ){
                fs.stat(file, function(err, stat){//������ݷ�ʽ���ļ�
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
            return function(old, neo, cb){//�ѵ�ǰĿ¼����Ķ�����������Ŀ¼�£������ھʹ�����
                cb = typeof cb == "function" ? cb : $.noop
                old = path.resolve(process.cwd(), old);
                neo = path.resolve(process.cwd(), neo);//����������һ��������
                $.mkdir(neo, function(){
                    $.walk(old, function( files, dirs ){
                        var n = dirs.length
                        if( n ){//�������Ŀ¼
                            for(var i  = 0 , c = n; i < n ; i++){
                                var p = path.join(neo,  dirs[i].replace(old,""))
                                $.mkdir(p, function(){
                                    c--
                                    if(c == 0){//Ŀ¼�������
                                        copyFiles(files, old, neo, cb)
                                    }
                                })
                            }
                        }else if(files.length){//���������Ŀ¼�������ļ�
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