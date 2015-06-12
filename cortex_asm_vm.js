// Virtual Machine for matrix language
// Copyright (c) 2012-2015 Gorkem Gencay. All rights reserved.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

"use strict";

var asm_end_func, asm_async_preload = false;

//if preloading it is an async function that will wait loading images than will call asm_end_func
//image loading in browsers cant be synchronous
function asm_execute( onfinish)
{
	if (asm_async_preload)
	{
		imagePreload();
		asm_end_func = onfinish;
	}
	else
	{
		var result = asm_execute_aux();
	
		if (onfinish)
			onfinish(result);
			
		return result;
	}
}

function asm_preload_finish()
{
	asm_execute_aux();
	
	if (asm_end_func)
		asm_end_func();
}

function asm_execute_aux()
{
	try
	{	
		asm_init();
		
		
		//(new Function("var ticTime = new Date();" + compiled_js_test + ";alert(sp + '  ' + ((new Date())- ticTime))"))();
		(new Function(cortexParser.getCompiledJS()))();
		
		//(new Function(compiled_js))();  // this is actually : 'eval(compiled_js);' , alternative(which is also faster than raw eval) : eval.call(null, compiled_js);
				
		if (asm_sp != 0 && console_print)
			console_print("Warning: stack not cleared properly : " + asm_sp + "  " + asm_sp);
	}
   	catch(err)
	{
		if(!console_print_run_error)
			throw err;
		if ( err.message)
			console_print_run_error(err.message);
		else
			console_print_run_error(err);
			
		return false;
	}
	
	return true;
}


////////////// stack 
var stack = new Array(1000);
var heap = new Array(1000); // store for global variables 

var asm_sp = 0;      // stack pointer(sp)

//registers. for complex types like matrix it stores reference.
var asm_reg0 = 0;
var asm_reg1 = 0;
var asm_reg0_real = 0;
var asm_reg1_real = 0;

//frame/base pointer(bp)
var asm_bp = 0;
var __ans;

function asm_init()
{
	__ans = undefined;
	asm_sp = 0;
	asm_bp = 0;
	
	asm_reg0 = undefined;
}

function asm_reg0_set(val)
{
	asm_reg0 = val;
}

function asm_push()
{
    stack[asm_sp++] = asm_reg0;
}

function asm_pop()
{
    asm_reg0 = stack[--asm_sp];
}

function asm_pop1()
{
    asm_reg1 = stack[--asm_sp];
}


function asm_pop1_real()
{
    asm_reg1_real = stack[--asm_sp];
}

function asm_push_real()
{
    stack[asm_sp++] = asm_reg0_real;
}

function asm_pop_real()
{
    asm_reg0_real = stack[--asm_sp];
}


function asm_reg0_stack_read(rel_pos)
{
	asm_reg0 = stack[asm_bp + rel_pos];
}

function asm_reg0_stack_write(rel_pos)
{
	stack[asm_bp + rel_pos] = asm_reg0;
}

function asm_reg0_stack_read_real(rel_pos)
{
	asm_reg0_real = stack[asm_bp + rel_pos];
}

function asm_reg0_stack_write_real(rel_pos)
{
	stack[asm_bp + rel_pos] = asm_reg0_real;
}


function asm_load_matrix(rows, cols) //n,m
{
	//asm_reg0 = Matrix.Zero(rows,cols);
	asm_reg0 = new Array(rows);
	
	//var rows = asm_reg0.elements.length, cols = asm_reg0.elements[0].length;
	//var rows = asm_reg0.length, cols = asm_reg0[0].length;
	var i,j;
	var eax;
	for(i = rows-1; i >=0; i--)
	{
		asm_reg0[i] = new Array(cols);
		for(j = cols-1; j>=0; j--)	
		{
			eax = stack[--asm_sp];
			asm_reg0[i][j] = eax;
		}
	}

}



function asm_reg0_dub_matrix()
{
	asm_reg0 = numeric.clone(asm_reg0);
}

function asm_string_get_elm()
{	
	var s = stack[--asm_sp];
	
	var i = stack[--asm_sp];
	
	if (i >= s.length)
		cortex.error_run('Index out of bounds.');
	//asm_reg0 = m.elements[i][j];
	asm_reg0_real = s.charCodeAt(i);
}

/* in javascript Strings are immutable so it does not work in this simple form.
function asm_string_set_elm()
{	
	asm_sp--;
	var s = stack[asm_sp];
	
	asm_sp--;
	var i = stack[asm_sp];
	
	if (i >= s.length)
		cortex.error_run('Index out of bounds.');
	
	s = s.substr(0, i) + asm_reg0 + s.substr(i+asm_reg0.length);
	//s.replaceAt((asm_reg0));
}*/

function asm_matrix_get_elm()
{	
	var m = stack[--asm_sp];
	
	var j = stack[--asm_sp];
	
	var i = stack[--asm_sp];	
	
	asm_util_matrix_boundary_check(m,i,j);
	//asm_reg0 = m.elements[i][j];
	asm_reg0_real = m[i][j];
	
}

function asm_matrix_set_elm()
{	
	var m = stack[--asm_sp];
	
	var j = stack[--asm_sp];
	
	var i = stack[--asm_sp];	
		
	asm_util_matrix_boundary_check(m,i,j);
	
	//m.elements[i][j] = asm_reg0;
	m[i][j] = asm_reg0_real;
}



//function pointer usage. reg0 holds pointer to a function
//js does not allow such funtionality in an evaled code !!!
function asm_call_reg0()
{
	// none of below worked
	//var func = eval("asm_func_" + asm_reg0);
	//func = eval("asm_push");
	//asm_fjump_table(asm_reg0);
	//func();
	//window["asm_func_" + asm_reg0]();
	//asm_reg0();
}


function asm_util_matrix_map(M, fn)
{
	var i; 
	var j;
	
	var _n = M.length;
	var _m = M[0].length;
	
	for (j = _n - 1; j >= 0; j--) 
	{ 
		//ret[j] = arguments.callee(x[j], _s, _k + 1); 
		var ret = M[j];
		
		for (i = _m - 1; i >= 3; --i) 
		{ 
			ret[i] = fn(ret[i]);
			--i; 
			ret[i] = fn(ret[i]);
			--i; 
			ret[i] = fn(ret[i]);
			--i; 
			ret[i] = fn(ret[i]);
		} 
		
		while (i >= 0) 
		{ 
			ret[i] = fn(ret[i]);
			--i; 
		} 
	} 
}

function asm_util_matrix_boundary_check(M,i,j)
{
	//if (i>=M.elements.length || j>= M.elements[0].length || j<0 || i<0)
	if (i>=M.length || j>= M[0].length || j<0 || i<0)
	{
		cortex.error_run('Index out of bounds.');
	}
}

function asm_util_column_matrix_to_array(mat)
{
	var arr = new Array(mat.length);
	for (var i=0; i< arr.length;i++)
	{
		arr[i] = mat[i][0];
	}
	
	return arr;
}

function asm_util_array_to_column_matrix(arr)
{
	var mat = new Array(arr.length);
	for (var i=0; i< arr.length;i++)
	{
		mat[i] = [arr[i]];
	}
	
	return mat;
}

///// ADD OPs ////////
function asm_add_real()
{
	asm_reg0_real = ( asm_reg1_real + asm_reg0_real);
}

function asm_add_rm() // real matrix add
{
	var new_m = numeric.clone(asm_reg0);
	asm_util_matrix_map(new_m, function(x){ return x+asm_reg1_real;});
	
	asm_reg0 = new_m;
}

function asm_add_mr() // real matrix add
{	
	var new_m = numeric.clone(asm_reg1);
	asm_util_matrix_map(new_m, function(x){ return x+asm_reg0_real;});
	
	asm_reg0 = new_m;
}

function asm_add_mm() // real matrix add
{
	if (asm_reg1.length != asm_reg0.length || asm_reg1[0].length != asm_reg0[0].length)
	{
		cortex.error_run('Matrix size mismatch.');
	}
	asm_reg0 = numeric.add(asm_reg1,asm_reg0); 
	/*if (r==null)
	{
		cortex.error_run('Matrix size mismatch.');
	}*/
	
}

function asm_str_concat()
{
	asm_reg0 = asm_reg1 + asm_reg0;
}

function asm_str_concat_sr()
{
	asm_reg0 = asm_reg1 + asm_reg0_real;
}

function asm_str_concat_rs()
{
	asm_reg0 = asm_reg1_real + asm_reg0;
}

function asm_inc_mat()
{
	asm_util_matrix_map(asm_reg0, function(x){ return x+1;});
}


///// SUB OPs  ///////////
function asm_sub_real()
{
	asm_reg0_real = asm_reg1_real - asm_reg0_real;
}

function asm_sub_mm() // real matrix sub
{
	if (asm_reg1.length != asm_reg0.length || asm_reg1[0].length != asm_reg0[0].length)
	{
		cortex.error_run('Matrix size mismatch.');
	}
	
	asm_reg0 = numeric.sub(asm_reg1,asm_reg0); 
}

function asm_sub_rm() // scalar matrix ops
{
	var new_m = numeric.clone(asm_reg0);
	asm_util_matrix_map(new_m, function(x){ return asm_reg1_real - x ;});
	
	asm_reg0 = new_m;
}

function asm_sub_mr() // scalar matrix ops
{
	var new_m = numeric.clone(asm_reg1);
	asm_util_matrix_map(new_m, function(x){ return x - asm_reg0_real;});
	
	asm_reg0 = new_m;
}

function asm_dec_mat()
{
	asm_util_matrix_map(asm_reg0, function(x){ return x-1;});
}


///// MUL OPs  ///////////
function asm_mul_real()
{
	asm_reg0_real = asm_reg1_real * asm_reg0_real;
}

function asm_mul_rm() // scalar matrix ops
{
	var new_m = numeric.clone(asm_reg0);
	asm_util_matrix_map(new_m, function(x){ return x * asm_reg1_real;});
	
	asm_reg0 = new_m;
}

function asm_mul_mr() // scalar matrix ops
{
	var new_m = numeric.clone(asm_reg1);
	asm_util_matrix_map(new_m, function(x){ return x * asm_reg0_real;});
	
	asm_reg0 = new_m;
}


function asm_mul_mm() // matrix matrix mmul
{
	if (asm_reg1[0].length != asm_reg0.length)
	{
		cortex.error_run('Matrix size mismatch.');
	}
	asm_reg0 = numeric.dot(asm_reg1,asm_reg0);
	
	/*if (r==null)
	{		
		cortex.error_run('Matrix size mismatch.');
	}*/
}

///// DIV OPs  ///////////
function asm_div_real()
{
	asm_reg0_real = asm_reg1_real / asm_reg0_real;
}

 function asm_div_mr() // scalar matrix ops
{
	var new_m = numeric.clone(asm_reg1);
	asm_util_matrix_map(new_m, function(x){ return x / asm_reg0_real;});
	
	asm_reg0 = new_m;
}


function asm_elm_mul()
{
	if (asm_reg1.length != asm_reg0.length || asm_reg1[0].length != asm_reg0[0].length)
	{
		cortex.error_run('Matrix size mismatch.');
	}
	asm_reg0 = numeric.mul(asm_reg1,asm_reg0);
}

function asm_elm_div()
{
	if (asm_reg1.length != asm_reg0.length || asm_reg1[0].length != asm_reg0[0].length)
	{
		cortex.error_run('Matrix size mismatch.');
	}
	asm_reg0 = numeric.div(asm_reg1,asm_reg0);
}

///// BOOL OPs ////////
function asm_and_bool()
{
	asm_reg0_real = asm_reg1_real && asm_reg0_real;
}

function asm_or_bool()
{
	asm_reg0_real = asm_reg1_real || asm_reg0_real;
}

function asm_not_bool()
{
	asm_reg0_real = asm_reg0_real == 0 ? 1 : 0; 
	
}

///// RELATIONAL OPs ////////
function asm_le()
{
	asm_reg0_real = asm_reg1_real < asm_reg0_real ? 1 : 0; 
}

function asm_ge()
{
	asm_reg0_real = asm_reg1_real > asm_reg0_real ? 1 : 0; 
}

function asm_eq()
{
	asm_reg0_real = asm_reg0_real == asm_reg1_real ? 1 : 0; 
}

function asm_neq()
{
	asm_reg0_real = asm_reg0_real != asm_reg1_real ? 1 : 0; 
}

function asm_geq()
{	
	asm_reg0_real = asm_reg1_real >= asm_reg0_real ? 1 : 0; 
}

function asm_leq()
{	
	asm_reg0_real = asm_reg1_real <= asm_reg0_real ? 1 : 0; 
}

function asm_str_eq()
{
	asm_reg0_real = asm_reg1 == asm_reg0 ? 1 : 0; 
}

function asm_str_neq()
{
	asm_reg0_real = asm_reg1 != asm_reg0 ? 1 : 0; 
}

function asm_matrix_eq()
{	
	asm_reg0_real = asm_matrix_same(asm_reg1, asm_reg0) ? 1 : 0; 
}

function asm_matrix_neq()
{	
	asm_reg0_real = !asm_matrix_same(asm_reg1, asm_reg0) ? 1 : 0; 
}

function asm_reg0_transpose()
{
	asm_reg0 = numeric.transpose(asm_reg0);
}

// copied and modifed from numeric.same = function same(x,y)
function asm_matrix_same(x,y) {
    return cortex.matrixsame(x,y);
}

function asm_matrix_get_slice(type)
{
	var m = stack[--asm_sp];
	
	var to2 = stack[--asm_sp];
		
	if (type == 1)
	{
		var from2 = to2;
	}
	else
	{
		var from2 = stack[--asm_sp];	
	}
	
	var to1 = stack[--asm_sp];
	
	if (type == 2)
	{
		var from1 = to1;
	}
	else
	{
		var from1 = stack[--asm_sp];
	}
	
	if (to1 < 0) to1 += m.length;
	if (to2 < 0) to2 += m[0].length;
	
	asm_util_matrix_boundary_check(m,from1,from2);
	asm_util_matrix_boundary_check(m,to1,to2);
	
	asm_reg0 = numeric.getBlock(m, [from1,from2], [to1,to2])
}

function asm_matrix_set_slice(type)
{
	var m = stack[--asm_sp];
	
	var to2 = stack[--asm_sp];
		
	if (type == 1)
	{
		var from2 = to2;
	}
	else
	{
		var from2 = stack[--asm_sp];	
	}
	
	var to1 = stack[--asm_sp];
	
	if (type == 2)
	{
		var from1 = to1;
	}
	else
	{
		var from1 = stack[--asm_sp];
	}
	
	if (to1 < 0) to1 += m.length;
	if (to2 < 0) to2 += m[0].length;
	
	asm_util_matrix_boundary_check(m, from1, from2);
	asm_util_matrix_boundary_check(m, to1, to2);
	if (to1 - from1 + 1 != asm_reg0.length || to2 - from2 + 1 != asm_reg0[0].length)
	{
		cortex.error_run('Matrix range assignment must have the same sizes');
	}
	
	
	asm_reg0 = numeric.setBlock(m, [from1, from2], [to1, to2], asm_reg0)
}


function asm_format_number(num, format)
{
	var pres = format ? 4 : 20;
	
	var s1 = num.toPrecision();
	var s2 = num.toPrecision(pres);
	
	return s1.length < s2.length ? s1 : s2;
}

function asm_matrix_print(M, format, style)
{
	var s='';
	
	if (M===undefined || M[0]===undefined)
	{
		s+= "\tundefined";
		return s;
	}
	
	var rows = M.length;
	var cols = M[0].length;
	
	var pres = format ? 4 : 20;
	var padding = format ? 11 : 24;
		
	if (style ==1)
	{
		// m style
		var sep_b = '[';
		var sep_e = '];';
		var sep_ln = ';\n ';
		var sep_elm = ', ';
	}
	else if (style ==2)
	{
		// c style
		var sep_b = '[[';
		var sep_e = ']];';
		var sep_ln = '],\n[ ';
		var sep_elm = ', ';
	}
	else if (style ==3)
	{
		// LaTeX style
		var sep_b = '';
		var sep_e = '';
		var sep_ln = '\\\\\n';
		var sep_elm = '& ';
	}
	else if (style ==0)
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
