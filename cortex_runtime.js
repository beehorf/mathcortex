/*
Copyright (c) 2012-2016 Gorkem Gencay. 


Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:


The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.


THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


*/

"use strict";


var cortex = function() { };

cortex.print = cortex.print_error = function(s){
	console.log(s)
};

cortex.print_run_error = function(err){
	console.log(err.message)
};

cortex.disp_options = function(opts)
{
	opts.style = 0;
	opts.format = true;
}

//we can not load images and run the code in one call in browsers. 
//we have to load all images and other resources before excuting main code. 
//if preloading is needed, after all images loaded, cortex.execute_aux will be called
//image loading in browsers cant be synchronous
cortex.execute = function ( code, onfinish, AsynLoad)
{
	if((typeof code === "object"))
	{
		AsynLoad = code.resources;
		code = code.code;
	}
		
	if ((typeof AsynLoad !== 'undefined') && AsynLoad.preload)
	{
		AsynLoad.asm_end_func = onfinish;
		resourcePreload(code, AsynLoad);
	}
	else
	{
		var result = cortex.execute_aux(code, AsynLoad);
	
		if (onfinish)
			onfinish(result);
			
		return result;
	}
	
	return false;
}


cortex.execute_aux = function(code, AsynLoad)
{
	var asm_vm = (typeof asm_init !== 'undefined');
	
	try
	{	
		if (asm_vm)
			asm_init(cortex.heap);
			
		cortex.__ans = undefined;
		
		//(new Function("var ticTime = new Date();" + compiled_js_test + ";alert(sp + '  ' + ((new Date())- ticTime))"))();		
		(new Function(code))();  // this is actually : 'eval(code);' , alternative(which is also faster than raw eval) : eval.call(null, code);
				
		if (asm_vm && asm_sp != 0 && cortex.print)
			cortex.print("Warning: stack not cleared properly : " + asm_sp + "  " + asm_sp);
	}
   	catch(err)
	{
		if(!cortex.print_run_error)
			throw err;
		
		cortex.print_run_error(err);
			
		return false;
	}
	
	return true;
}

cortex.heap = new Array(1000); // store for global variables 

cortex.__ans = undefined;

cortex.ticTime = 0;
var tableVar = {};
var imageVar = new Array;
cortex.animTimer = -1;


var openFigures = new Array;

cortex.plotTarget = undefined; 

cortex.getVarVal = function(name, Parser)
{		
	return cortex.heap[Parser.getGlobalScope().vars_rel_pos[name]];
}


cortex.create = function(m, n)
{
	var L = new Array(m);
	
    for (var i = 0; i < m; i++)
	{
		L[i] = new Array(n);
		for (var j = 0; j < n; j++)
		{
			L[i][j] = 0;
		}
	}
	
	return L;
}

cortex.rep = function(size, val)
{
	if(size[0] < 1 || size[1] < 1)
		cortex.error_run("Matrix size should be more than 1x1");
	return numeric.rep(size, val);
}

cortex.createinit = function(m,n,func)
{
	var L = new Array(m);
	
    for (var i = 0; i < m; i++)
	{
		L[i] = new Array(n);
		for (var j = 0; j < n; j++)
		{
			L[i][j] = func.apply( null, Array.prototype.slice.call(arguments, 1));
		}
	}
	
	return L;
}

// copied and modifed from numeric.same = function same(x,y)
cortex.matrixsame = function(x,y) {
    var i,n;
    if(!(x instanceof Array) || !(y instanceof Array)) { return false; }
    n = x.length;
    if(n !== y.length) { return false; }
    for(i=0;i<n;i++) {
        //if(x[i] === y[i]) { continue; }
		if( Math.abs(x[i] - y[i]) < 1e-9) { continue; } // !!!!!!!!!! by Gorkem !!!!!!!!!!!
        if(typeof x[i] === "object") { if(!cortex.matrixsame(x[i],y[i])) return false; }
        else { return false; }
    }
    return true;
}

cortex.getslice = function(m, row_b, row_e, col_b, col_e)
{
	if (row_e < 0) row_e += m.length;
	if (row_b < 0) row_b += m.length;
	if (col_e < 0) col_e += m[0].length;
	if (col_b < 0) col_b += m[0].length;

	cortex.matrix_boundary_check(m, row_b, col_b);
	cortex.matrix_boundary_check(m, row_e, col_e);
	
	return numeric.getBlock(m, [row_b, col_b], [row_e, col_e]);
}

cortex.getcol = function(m, row_b, row_e, col)
{
	if (row_e < 0) row_e += m.length;
	if (row_b < 0) row_b += m.length;
	if (col < 0) col += m[0].length;

	cortex.matrix_boundary_check(m, row_b, col);
	cortex.matrix_boundary_check(m, row_e, col);
	
	return numeric.getBlock(m, [row_b, col], [row_e,col]);
}

cortex.getrow = function(m, row, col_b, col_e)
{
	if (row < 0) row += m.length;
	if (col_e < 0) col_e += m[0].length;
	if (col_b < 0) col_b += m[0].length;

	cortex.matrix_boundary_check(m, row, col_b);
	cortex.matrix_boundary_check(m, row, col_e);
	
	return numeric.getBlock(m, [row, col_b], [row, col_e]);
}

cortex.setslice = function(m, row_b, row_e, col_b, col_e, source)
{
	if (row_e < 0) row_e += m.length;
	if (row_b < 0) row_b += m.length;
	if (col_e < 0) col_e += m[0].length;
	if (col_b < 0) col_b += m[0].length;
	if (source.length != row_e - row_b + 1)
		cortex.error_run('Matrix row size mismatch: ' + (source.length) + ' !=  ' + (row_e - row_b + 1) );
	if (source[0].length != col_e - col_b + 1)
		cortex.error_run('Matrix column size mismatch: ' + (source[0].length) + ' != ' + (col_e - col_b + 1) );

	cortex.matrix_boundary_check(m, row_b, col_b);
	cortex.matrix_boundary_check(m, row_e, col_e);
	
	return numeric.setBlock(m, [row_b, col_b], [row_e, col_e], source);
}

cortex.setcol = function(m, row_b, row_e, col, source)
{
	if (row_e < 0) row_e += m.length;
	if (row_b < 0) row_b += m.length;
	if (col < 0) col += m[0].length;	
	if (source.length != row_e - row_b + 1)
		cortex.error_run('Matrix row size mismatch: ' + (source.length) + " != " + (row_e - row_b + 1) );
	if (source[0].length != 1)
		cortex.error_run('Matrix column size mismatch: ' + (source[0].length) + " != 1" );

	cortex.matrix_boundary_check(m, row_b,col);
	cortex.matrix_boundary_check(m, row_e, col);
	
	return numeric.setBlock(m, [row_b, col], [row_e, col], source);
}

cortex.setrow = function(m, row, col_b, col_e, source)
{	
	if (row < 0) row += m.length;
	if (col_e < 0) col_e += m[0].length;
	if (col_b < 0) col_b += m[0].length;
	if (source[0].length != col_e - col_b + 1)
		cortex.error_run('Matrix column size mismatch: ' + (source[0].length) + ' != ' + (col_e - col_b + 1));
	if (source.length != 1)
		cortex.error_run('Matrix row size mismatch: ' + source.length + ' != 1');

	cortex.matrix_boundary_check(m, row, col_b);
	cortex.matrix_boundary_check(m, row, col_e);
	
	return numeric.setBlock(m, [row, col_b], [row, col_e], source);
}

cortex.matrix_boundary_check = function(M, i, j)
{
	if (i>=M.length || j>= M[0].length || j<0 || i<0)
	{
		cortex.error_run('Index out of bounds.');
	}
}

cortex.eig = function(M)
{
	if(M.length != M[0].length) cortex.error_run('matrix must be square.');
	var r = numeric.eig(M);
	var ret = new Array(4);
	ret[0] = asm_util_array_to_column_matrix(r.lambda.x); 
	
	ret[1] = r.E.x;
	
	if(r.lambda.y != undefined) { 
		cortex.print('eig has complex eigenvectors');
		ret[2] = asm_util_array_to_column_matrix(r.lambda.y);
		ret[3] = r.E.y;
	} else
	{
		ret[2] = numeric.rep([M.length, 1],0);
		ret[3] = numeric.rep([M.length, M.length],0);
	}
	
	return ret;
}

cortex.cholesky = function(A) {
	var n = A.length;
    
	var L = cortex.create(n,n);
	
    for (var i = 0; i < n; i++)
	{
        for (var j = 0; j < (i+1); j++) {
            var s = 0;
            for (var k = 0; k < j; k++)
                s += L[i][k] * L[j][k];
            L[i][+ j] = (i == j) ?
                           Math.sqrt(A[i][i] - s) :
                           (1.0 / L[j][j] * (A[i][j] - s));
        }
	}
	
    return L;
}

cortex.randn = function()
{
	var x1, x2, w, y1, y2;
 
	do {
		 x1 = 2.0 * Math.random() - 1.0;
		 x2 = 2.0 * Math.random() - 1.0;
		 w = x1 * x1 + x2 * x2;
	} while ( w >= 1.0 );

	w = Math.sqrt( (-2.0 * Math.log( w ) ) / w );
	y1 = x1 * w;
	y2 = x2 * w;
	
	return y1;
}

cortex.dot = function(M1, M2)
{
	if (M1[0].length != M2.length)
	{
		cortex.error_run('Matrix size mismatch.');
	}
	
	return numeric.dot(M1,M2);
}

cortex.matrix_size_check = function(M1, M2)
{
	if (M1.length != M2.length || M1[0].length != M2[0].length)
	{
		cortex.error_run('Matrix size mismatch.');
	}
}

cortex.elm_mul = function(M1, M2)
{
	cortex.matrix_size_check(M1,M2);
	
	return numeric.mul(M1,M2);
}

cortex.elm_div = function(M1, M2)
{
	cortex.matrix_size_check(M1,M2);
	
	return numeric.div(M1,M2);
}

cortex.add_mm = function(M1, M2)
{
	cortex.matrix_size_check(M1,M2);
	
	return numeric.add(M1,M2);
}

cortex.sub_mm = function(M1, M2)
{
	cortex.matrix_size_check(M1,M2);
	
	return numeric.sub(M1,M2);
}

cortex.error_run = function(s)
{
	throw new Error(s);
}

/*

// QR decomposition in pure javascript
cortex.qr = function (mat) {
    var m = mat.length, n = mat[0].length;
    var Q = numeric.identity(m);
    var R = numeric.clone(mat);

    for (var k = 1; k < Math.min(m, n); k++) {
        var ak = R.slice(k, 0, k, k).col(1);
        var oneZero = [1];

        while (oneZero.length <= m - k)
            oneZero.push(0);

        oneZero = $V(oneZero);
        var vk = ak.add(oneZero.x(ak.norm() * Math.sign(ak.e(1))));
        var Vk = $M(vk);
        var Hk = Matrix.I(m - k + 1).subtract(Vk.x(2).x(Vk.transpose()).div(Vk.transpose().x(Vk).e(1, 1)));
        var Qk = identSize(Hk, m, n, k);
        R = Qk.x(R);
        // slow way to compute Q
        Q = Q.x(Qk);
    }

    return {
        Q: Q,
        R: R
    };
}*/

cortex.print_var = function(var_val, var_name, format, style, header)
{
	var s="";

	if (var_val!=null)
	{
		if ( typeof(var_val) == 'number')
		{
			var fs = cortex.format_number(var_val)

			if (header)
				s += var_name + ' = ' + fs + '\n';
			else
				s += fs;
		}
		else if ( typeof(var_val) == 'string' || typeof(var_val) == 'boolean')
		{
			if (header)
				s += var_name + ' = "' + var_val + '"\n';
			else
				s += '"' + var_val + '"';
		}
		else
		{
			if(header)
				s += cpu_matrix_print_header( var_name, var_val, style);

			if (var_val.length * var_val[0].length< 100)
				s += cortex.matrix_print(var_val) +"\n";
			else
				s += '\tlarge matrix(use \'disp\')';

		}
	}
	else
	{
		s += "<i>unassigned</i>";
	}

	return s;
}

function cpu_matrix_print_header(varname, M, style)
{
	var s=varname;

	var rows = M.length;
	var cols = M[0].length;

	if (style ==1)
	{
		// m style
		var sep_b = '[';
		var sep_e = '];';
		var sep_ln = ';\n ';
		var sep_elm = ', ';

		s += '[' + rows  + ', ' + cols + '] \n';
	}
	else if (style ==2)
	{
		// c style
		var sep_b = '[[';
		var sep_e = ']];';
		var sep_ln = '],\n[ ';
		var sep_elm = ', ';

		s += '[' + rows  + '][' + cols + '] \n';
	}
	else if (style ==3)
	{
		// LaTeX style
		var sep_b = '';
		var sep_e = '';
		var sep_ln = '\\\\\n';
		var sep_elm = '& ';

		s += '[' + rows  + ', ' + cols + '] \n';
	}
	else if (style ==0)
	{
		//plain
		var sep_b = '';
		var sep_e = '';
		var sep_ln = '\n';
		var sep_elm = '\t';

		s += '[' + rows  + ', ' + cols + '] \n';
	}

	return s;
}


cortex.format_number = function(num)
{
	var opts = {};
	cortex.disp_options(opts);
	
	var pres = opts.format ? 4 : 20;
	
	var s1 = num.toPrecision();
	var s2 = num.toPrecision(pres);
	
	return s1.length < s2.length ? s1 : s2;
}

cortex.matrix_print = function(M)
{
	var opts = {};
	cortex.disp_options(opts);
	
	var s='';
	
	if (M===undefined || M[0]===undefined)
	{
		s+= "\tundefined";
		return s;
	}
	
	var rows = M.length;
	var cols = M[0].length;
	
	var pres = opts.format ? 4 : 20;
	var padding = opts.format ? 11 : 24;
		
	if (opts.style ==1)
	{
		// m style
		var sep_b = '[';
		var sep_e = '];';
		var sep_ln = ';\n ';
		var sep_elm = ', ';
	}
	else if (opts.style ==2)
	{
		// c style
		var sep_b = '[[';
		var sep_e = ']];';
		var sep_ln = '],\n[ ';
		var sep_elm = ', ';
	}
	else if (opts.style ==3)
	{
		// LaTeX style
		var sep_b = '';
		var sep_e = '';
		var sep_ln = '\\\\\n';
		var sep_elm = '& ';
	}
	else if (opts.style ==0)
	{
		//plain
		var sep_b = '';
		var sep_e = '';
		var sep_ln = '\n';
		var sep_elm = ' ';
	}

	s+=sep_b;
	var s1,s2;
	var v;
		
	var i,j;
	for(i = 0; i < rows; i++)
	{
		var R = M[i];
		for(j = 0 ; j < cols; j++)	
		{						
			v = R[j];
			s1 = v.toPrecision();
			s2 = v.toPrecision(pres);
			var s_add;
			if (s1.length < s2.length) s_add = s1; else s_add = s2;
			if (v >= 0)
				s_add = ' ' + s_add;
			for( var slen = s_add.length ; slen < padding; slen++)
				s_add += ' ';
			
			s += s_add;
			if(j!=cols-1)
				s+=sep_elm;
		}
		
		if(i!=rows-1)
			s+= sep_ln;
	}
	
	s+=sep_e;	

	return s;
}

function plotGetArray(mat)
{
	var arr;

	if (mat.length == 1)
	{
		arr = mat[0];
	}
	else
	{
		if (mat[0].length != 1)
		{
			cortex.error_run('Plot error. Matrix should be 1 by n or n by 1.');
		}
		else
		{
			arr = new Array(mat.length);
			for (var i=0; i< arr.length;i++)
			{
				arr[i] = mat[i][0];
			}
		}
	}

	return arr;
}


function closeFigures(nameid)
{
	if (typeof(nameid) == 'string')
	{
		if(nameid == 'all')
		{
			for(var i = 0 ; i < openFigures.length ; i++)
			{
				if (openFigures[i] != "_closed")
					removePlot(openFigures[i]);//openFigures[i].close();
			}

			openFigures = new Array();
		}
		else
		{
			cortex.error_run("close : unrecognized command")
		}
	}
	else if (typeof(nameid) == 'number')
	{
		if (nameid < openFigures.length && openFigures[nameid] != "_closed")
		{
			removePlot(openFigures[nameid]);//openFigures[nameid].close();
			openFigures[nameid] = "_closed";
		}
		else
		{
			cortex.error_run("close : invalid figure handle")
		}
	}
}

function removePlot(id)
{
	$('#'+id).hide( function() {
		document.getElementById("plot_cont").removeChild(document.getElementById(id));
	}
	);
}

function addPlot(ind, ifrm_id, width, height)
{
	var ifrm = document.createElement("iframe");
	document.getElementById("plot_cont").insertBefore(ifrm, document.getElementById("plot_cont").firstChild);
	ifrm.setAttribute("id", ifrm_id);
	ifrm.setAttribute("style", "width:" + width + "px;height:" + height + "px;background-color:#ffffff;border:1px solid #CCC;margin:5px;visibility:visible;box-shadow: 3px 3px 5px 0px #AAA;max-width:90%");	
	ifrm.maxWidth = width; // 480, 430
	ifrm.maxHeight = height;
	
	return ifrm;
}

function togglePlot(id)
{
	var ifrm = $("#" + id);
	var h = ifrm.css('height'); 
	
	if(h == '50px')
	{
		ifrm.css('height', ifrm[0].maxHeight + 'px');
		ifrm.css('width',  ifrm[0].maxWidth + 'px');
		return true;
	}
	else
	{
		ifrm.css('height', '50px');
		ifrm.css('width', '250px');
		return false;
	}
}

var iframe_ind = 0;

function plotArray(mat, mat2, opts, mat21, mat22, opts2, test1)
{
	var arrY, arrX;
	var arrY2, arrX2;

	if (mat2 == undefined)
	{
		arrY = plotGetArray(mat);
	}
	else
	{
		arrX = plotGetArray(mat);
		arrY = plotGetArray(mat2);

		if (arrX.length != arrY.length)
			cortex.print( 'Warning : Plot array size mismatch.');
	}
	
	if(mat21)
	{
		if (mat22 == undefined)
		{
			arrY2 = plotGetArray(mat21);
		}
		else
		{
			arrX2 = plotGetArray(mat21);
			arrY2 = plotGetArray(mat22);

			if (arrX2.length != arrY2.length)
				cortex.print( 'Warning : Plot array size mismatch.');
		}
	}


	var plotD = {};
	var ind = iframe_ind++;

	if(mat21)
	{
		plotD.data2 = new Array();
		for (var i=0; i< arrY.length;i++)
		{
			plotD.data2[i] = [arrX2 ? arrX2[i] : i , arrY2[i]];
		}
		
		plotD.opts2 = opts2;
	}
	
	plotD.data1 = new Array();
	for (var i=0; i< arrY.length;i++)
	{
		plotD.data1[i] = [arrX ? arrX[i] : i , arrY[i]];
	}
	
	plotD.opts = opts;
	
	if( cortex.plotTarget == undefined)
	{
		var ifrm_id = "plot_test_iframe" + ind;
		var ifrm = addPlot(ind, ifrm_id, 480, 430);	
		
		ifrm.onload = function()
		{
			this.contentWindow.update_data(plotD);
			this.contentWindow.close_clb = removePlot;
			this.contentWindow.toggle_clb = togglePlot;
			this.contentWindow.clb_params = ifrm_id;
		};
		
		ifrm.src = "html/plot.html#"+ind;
		if (ifrm.contentWindow.update_data)
			ifrm.contentWindow.update_data(plotD);
			
		return openFigures.push(ifrm_id) - 1;
	}
	else 
		plot_init(plotD);
	
	return -1;
	
}

function tableviewArray(arr, varname, format, style)
{
	tableVar = {arr:arr, name:varname, format:format, style:style};
	var tableWindow=window.open("html/table.html", varname, "resizable=yes,scrollbars=yes,status=no,height=320, width=620");
}


cortex.startAnim = function(updateFunc, interval)
{
	$("#anim_area").fadeIn('fast');
	cortex.stopAnim();
	
	cortex.animTimer = setInterval( function() { 
				try { 
					updateFunc(-1);
					if (false)	{
						clearInterval(cortex.animTimer);		
						cortex.print('Animation is stopped');
						update_editor(); 
					} 
				} 
				catch(err) 
				{ 
					clearInterval(cortex.animTimer); 
					cortex.print_run_error(err.message); 
				}		
			}, 
			interval);
			
	cortex.print("Animation is started. ");
}

cortex.animSize = function(w, h)
{
	$('#anim_canvas').css('width','' + w);
	$('#anim_canvas').css('height','' + h);
}

cortex.stopAnim = function()
{
	if(cortex.animTimer != -1)
	{
		clearInterval(cortex.animTimer);
		cortex.print('Animation is stopped');
	}
	
	cortex.animTimer = -1;
}

cortex.updateAnim = function(id, m1, m2, m3)
{
	var _setPixelIm;
	var canvas = document.getElementById("anim_canvas");
	var _simContex = canvas.getContext("2d");
	
	if(m2 === undefined)
		m2 = m1;
	if(m3 === undefined)
		m3 = m1;
	
	if(canvas.width <= 0 || canvas.width != m1[0].length || canvas.height != m1.length)
	{
		canvas.width = m1[0].length;
		canvas.height = m1.length;
		
		_setPixelIm = _simContex.createImageData(canvas.width, canvas.height);		
	}
	else
	{
		_setPixelIm = _simContex.getImageData(0,0,canvas.width, canvas.height);
	}
	
	var _setPixelData  = _setPixelIm.data;
	
	var height = m1[0].length;
	var width = m1.length;
	var pos = 0;
	
	for (var y = 0; y < height; y++)
	{
		for (var x = 0; x < width; x++)
		{
			// set red, green, blue, and alpha:
			_setPixelData[pos++] = Math.max(0,Math.min(255, m1[y][x]));
			_setPixelData[pos++] = Math.max(0,Math.min(255, m2[y][x]));
			_setPixelData[pos++] = Math.max(0,Math.min(255, m3[y][x]));
			_setPixelData[pos++] = 255; // opaque alpha
		}
	}
	
	_simContex.putImageData(_setPixelIm, 0, 0); // at coords 0,0
}

function showImage(m1, m2, m3)
{
	var imageD = {};
	if (m2 !== undefined)
		imageD = {R : m1, G : m2, B : m3} ;
	else
		imageD = {R : m1, G : m1, B : m1} ;

	var ind = iframe_ind++;
	var winW = (imageD.R[0].length < 200 ? 200 : imageD.R[0].length) + 40;
	var winH = (imageD.R.length < 200 ? 200 : imageD.R.length) + 95;
		
	//var tableWindow=window.open("html/image.html#" + i, "_blank", "resizable=yes,scrollbars=yes,status=no, width=" + winW + ", height=" + winH);
	var ifrm_id = "plot_test_iframe" + ind;
	var ifrm = addPlot(ind, ifrm_id, winW, winH);
	ifrm.onload = function()
	{
		this.contentWindow.generateImage(imageD);
		this.contentWindow.close_clb = removePlot;
		this.contentWindow.toggle_clb = togglePlot;
		this.contentWindow.clb_params = ifrm_id;
	};
	
	ifrm.src = "html/image.html#" + ind;
	if (ifrm.contentWindow.generateImage)
		ifrm.contentWindow.generateImage(imageD);

	return openFigures.push(ifrm_id) - 1;
}

function updateTitle(id, title)
{
	if(id === undefined)
		id = iframe_ind-1;
	if(id < 0 || id >= iframe_ind || openFigures[id] === '_closed')
		cortex.error_run("Invalid handle for title '" + id + "'");
	
	var plot_win = $('#plot_test_iframe' + id)[0].contentWindow;
	if (plot_win.update_title)
		plot_win.update_title(title);
	else
	{
		$('#plot_test_iframe' + id).load( function() { 
			plot_win.update_title(title);
		});
	}
}

function resourcePreload(code, AsyncLoad)
{
	cortex.resources = {};
	cortex.resources.images = [];
	cortex.resources.images_alias = [];
	cortex.resources.images_src = [];
	for(var i = 0; i < AsyncLoad.image_src.length; i++)
	{
		var img = new Image;
		img.done = false;

		cortex.resources.images.push(img);

		img.onload = function() {
			var canvas = document.createElement("canvas");
			var ctx = canvas.getContext("2d");

			canvas.width = this.width;
			canvas.height = this.height;
			ctx.drawImage( this, 0, 0 );
			this.done = true;

			this.imgPixels = ctx.getImageData(0, 0, this.width, this.height).data;

			cortex.print("Image loaded : " + this.src);

			var flag = true;
			for(var i = 0; i < cortex.resources.images.length; i++)
			{
				if (cortex.resources.images[i].done == false)
				{
					flag = false;
					break;
				}
			}

			if (flag)
			{
				cortex.execute_aux(code, AsyncLoad);
	
				if (AsyncLoad.asm_end_func)
					AsyncLoad.asm_end_func();
			}
		}

		img.onerror = function(ev) {
			cortex.print("Error: The image could not be loaded : " + this.src);
		}
	}

	for(var i = 0; i < AsyncLoad.image_src.length; i++)
	{
		cortex.resources.images[i].src = "php/imread.php?pic=" + encodeURIComponent(AsyncLoad.image_src[i]);
		cortex.resources.images_alias[i] = AsyncLoad.image_alias[i];
		cortex.resources.images_src[i] = AsyncLoad.image_src[i];
		cortex.print("Image loading : " + AsyncLoad.image_src[i]);
	}
}

function imageRead(url)
{
	for(var i = 0; i < cortex.resources.images.length; i++)
	{
		if (cortex.resources.images_src[i] == url || cortex.resources.images_alias[i]  == url)
		{
			var img = cortex.resources.images[i];

			var width = img.width;
			var height = img.height;

			var pR = new Array(height);
			for(var i=0;i < height; i++)
				pR[i] = new Array(width);

			var pG = new Array(height);
			for(var i=0;i < height; i++)
				pG[i] = new Array(width);

			var pB = new Array(height);
			for(var i=0;i < height; i++)
				pB[i] = new Array(width);


			var pos = 0;

			for(var i=0;i < height; i++)
				for(var j=0;j < width; j++)
				{
					pR[i][j] = img.imgPixels[pos++];
					pG[i][j] = img.imgPixels[pos++];
					pB[i][j] = img.imgPixels[pos++];
					pos++; // skip alpha TODO
				}
			return {R:pR, G:pG, B:pB};

		}
	}

	cortex.error_run("Image is not in preload list.");
}

