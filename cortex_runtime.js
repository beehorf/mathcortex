/*
Copyright (c) 2012-2015 Gorkem Gencay. 


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

cortex.ticTime = 0;
var tableVar = {};
var imageVar = new Array;

var Preloader = function(){};

Preloader.images = []; // array of Image
Preloader.image_src = [];   // array of strings(image names)
Preloader.image_alias = []; // array of strings(image aliases)
Preloader.import_src = [];

var plotVar = new Array;

var openFigures = new Array;

cortex.create = function(m,n)
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
        if(typeof x[i] === "object") { if(!asm_matrix_same(x[i],y[i])) return false; }
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

	asm_util_matrix_boundary_check(m, row_b, col_b);
	asm_util_matrix_boundary_check(m, row_e, col_e);
	
	return numeric.getBlock(m, [row_b, col_b], [row_e, col_e]);
}

cortex.getcol = function(m, row_b, row_e, col)
{
	if (row_e < 0) row_e += m.length;
	if (row_b < 0) row_b += m.length;
	if (col < 0) col += m[0].length;

	asm_util_matrix_boundary_check(m, row_b, col);
	asm_util_matrix_boundary_check(m, row_e, col);
	
	return numeric.getBlock(m, [row_b, col], [row_e,col]);
}

cortex.getrow = function(m, row, col_b, col_e)
{
	if (row < 0) row += m.length;
	if (col_e < 0) col_e += m[0].length;
	if (col_b < 0) col_b += m[0].length;

	asm_util_matrix_boundary_check(m, row, col_b);
	asm_util_matrix_boundary_check(m, row, col_e);
	
	return numeric.getBlock(m, [row, col_b], [row, col_e]);
}

cortex.setslice = function(m, row_b, row_e, col_b, col_e, source)
{
	if (row_e < 0) row_e += m.length;
	if (row_b < 0) row_b += m.length;
	if (col_e < 0) col_e += m[0].length;
	if (col_b < 0) col_b += m[0].length;

	asm_util_matrix_boundary_check(m, row_b, col_b);
	asm_util_matrix_boundary_check(m, row_e, col_e);
	
	return numeric.setBlock(m, [row_b, col_b], [row_e, col_e], source);
}

cortex.setcol = function(m, row_b, row_e, col, source)
{
	if (row_e < 0) row_e += m.length;
	if (row_b < 0) row_b += m.length;
	if (col < 0) col += m[0].length;	
	
	asm_util_matrix_boundary_check(m, row_b,col);
	asm_util_matrix_boundary_check(m, row_e, col);
	
	return numeric.setBlock(m, [row_b, col], [row_e, col], source);
}

cortex.setrow = function(m, row, col_b, col_e, source)
{	
	if (row < 0) row += m.length;
	if (col_e < 0) col_e += m[0].length;
	if (col_b < 0) col_b += m[0].length;

	asm_util_matrix_boundary_check(m, row, col_b);
	asm_util_matrix_boundary_check(m, row, col_e);
	
	return numeric.setBlock(m, [row, col_b], [row, col_e], source);
}

cortex.eig = function(M)
{
	if(M.length != M[0].length) cortex.error_run('matrix must be square.');
	var r = numeric.eig(M);
	var ret = new Array(4);
	ret[0] = asm_util_array_to_column_matrix(r.lambda.x); 
	
	ret[1] = r.E.x;
	
	if(r.lambda.y != undefined) { 
		console_print('eig has complex eigenvectors');
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
			var fs = asm_format_number(var_val, format)

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
				s += asm_matrix_print(var_val,format,style) +"\n";
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
				if (!openFigures[i].closed)
					openFigures[i].close();
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
		if (nameid < openFigures.length && !openFigures[nameid].closed)
		{
			openFigures[nameid].close();
		}
		else
		{
			cortex.Error_run("close : invalid figure handle")
		}
	}
}

function plotArray(mat, mat2, opts, mat21, mat22, opts2)
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
			console_print( 'Warning : Plot array size mismatch.');
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
				console_print( 'Warning : Plot array size mismatch.');
		}
	}


	plotVar.push(new Array());
	var ind = plotVar.length - 1;

	if(mat21)
	{
		plotVar[ind].data2 = new Array();
		for (var i=0; i< arrY.length;i++)
		{
			plotVar[ind].data2[i] = [arrX2 ? arrX2[i] : i , arrY2[i]];
		}
		
		plotVar[ind].opts2 = opts2;
	}
	
	plotVar[ind].data1 = new Array();
	for (var i=0; i< arrY.length;i++)
	{
		plotVar[ind].data1[i] = [arrX ? arrX[i] : i , arrY[i]];
	}
	
	plotVar[ind].opts = opts;
	


	var PlotWindow = window.open("html/plot.html#"+ind, "_blank", "resizable=yes,scrollbars=yes,status=yes,height=400, width=520");

	return openFigures.push(PlotWindow) - 1;
}

function tableviewArray(arr, varname, format, style)
{
	tableVar = {arr:arr, name:varname, format:format, style:style};
	var tableWindow=window.open("html/table.html", varname, "resizable=yes,scrollbars=yes,status=no,height=320, width=620");
}


function showImage(m1, m2, m3)
{
	if (m2 !== undefined)
		imageVar.push( {R : m1, G : m2, B : m3} );
	else
		imageVar.push( {R : m1, G : m1, B : m1} );

	var i = imageVar.length-1;
	var winW = (imageVar[i].R[0].length < 200 ? 200 : imageVar[i].R[0].length) + 60;
	var winH = (imageVar[i].R.length < 200 ? 200 : imageVar[i].R.length) + 65;
	var tableWindow=window.open("html/image.html#" + i, "_blank", "resizable=yes,scrollbars=yes,status=no, width=" + winW + ", height=" + winH);

	return openFigures.push(tableWindow) - 1;
}

function updateImage(id, m1, m2, m3)
{
	var imageVar;
	
	if (m2 !== undefined)
		imageVar = {R : m1, G : m2, B : m3};
	else
		imageVar = {R : m1, G : m1, B : m1};

	if(openFigures[id].document.readyState === "complete")
	{
		if (!openFigures[id].resized_once)
		{
			var winW = (imageVar.R[0].length < 200 ? 200: imageVar.R[0].length) + 145;
			var winH = (imageVar.R.length < 200 ? 200 : imageVar.R.length)  + 50;
			
			openFigures[id].resized_once = true;
			openFigures[id].resizeTo(winH, winW);
		}
		
		if(openFigures[id].generateImage)
			openFigures[id].generateImage(imageVar);
	}
}


function resourcePreload()
{
	Preloader.images = new Array();
	for(var i = 0; i < Preloader.image_src.length; i++)
	{
		var img = new Image;
		img.done = false;

		Preloader.images.push(img);

		img.onload = function() {
			var canvas = document.createElement("canvas");
			var ctx = canvas.getContext("2d");

			canvas.width = this.width;
			canvas.height = this.height;
			ctx.drawImage( this, 0, 0 );
			this.done = true;

			this.imgPixels = ctx.getImageData(0, 0, this.width, this.height).data;

			console_print("Image loaded : " + this.src);

			var flag = true;
			for(var i = 0; i < Preloader.images.length; i++)
			{
				if (Preloader.images[i].done == false)
				{
					flag = false;
					break;
				}
			}

			if (flag)
			{
				asm_preload_finish();
			}
		}

		img.onerror = function(ev) {
			console_print("Error: The image could not be loaded : " + this.src);
		}
	}

	for(var i = 0; i < Preloader.image_src.length; i++)
	{
		Preloader.images[i].src = "php/imread.php?pic=" + encodeURIComponent(Preloader.image_src[i]);
		console_print("Image loading : " + Preloader.image_src[i]);
	}
}

function imageRead(url)
{
	for(var i = 0; i < Preloader.image_src.length; i++)
	{
		if (Preloader.image_src[i] == url || Preloader.image_alias[i] == url)
		{
			var img = Preloader.images[i];

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
