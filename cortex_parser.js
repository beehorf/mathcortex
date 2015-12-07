/*
Compiler for MathCortex language

Copyright (c) 2012-2015 Gorkem Gencay. 

MathCortex Compiler is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

MathCortex Compiler is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with MathCortex Compiler.  If not, see <http://www.gnu.org/licenses/>.
*/

"use strict";

(function( cortexParser, undefined ) {

cortexParser.compile = function(code_inp, namespace)
{
	//ImportAsyncLoad(code_inp, namespace);
	
	if (namespace !== undefined)
		cortexParser.namespace = namespace;
	else
		cortexParser.namespace = "global";
		
	return cortexParser.compile_aux(code_inp);
}

cortexParser.compile_aux = function(code_inp)
{
	try
	{
		Init(code_inp);
		
		Program();
		compiled_asm += '\n/// Functions ///\n\n' + functions_asm + ftable_function();
		compiled_js_test +=  "\n" + export_global_scope() + '\n/// Functions ///\n\n' + functions_js_test + ftable_function(true);
		
	}
	catch(err)
	{
		compiled_asm = "";
		compiled_js_test = "";
		
		if(console_print_error)
			console_print_error(err.message);
		else	
			throw(err);
		
		return false;
	}
	
	return true;
};

cortexParser.execute = function() // todo : merge with asm_execute_aux? fix preload
{
	try
	{
		if(cortexParser.options["execute"] == "JS")
			(new Function(cortexParser.getCompiledJS()))();				
		else if(cortexParser.options["execute"] == "ASM")
			(new Function(cortexParser.getCompiledASM()))();
		else
			throw "Invalid pragma option 'execute' : " + cortexParser.options["execute"];
	}
   	catch(err)
	{
		if(!console_print_run_error)
			throw err;
		else if ( err.message)
			console_print_run_error(err.message);
		else
			console_print_run_error(err);
			
		return false;
	}
	
	return true;
	
};

cortexParser.options = { "execute": "JS" };

// Return last character position parsing. Used for error position
cortexParser.getInpPos = function()
{
	return inp_pos + report_pos - 1;
};


cortexParser.getCompiledCode = function()
{
	return compiled_asm;
};

cortexParser.getCompiledJS = function()
{
	return compiled_js_test;
};

cortexParser.getCompiledASM = function()
{
	return compiled_asm;
};

cortexParser.getGlobalScope = function()
{
	return global_scope;
};

cortexParser.isLastExpressionReal = function()
{
	return comp_type_is_real(last_expression_type);
};

cortexParser.clearAll = comp_clear_all;
cortexParser.clearVar = comp_clear_var;
cortexParser.functionList = [];

var types = [ "reserved", 
			  "bool" /* 1 */, 
			  "real" /* 2 */, 
			  "matrix" /* 3 */, 
			  "string", /* 4 */
			  "function" /* 5 */ , 
			  "functionptr" /* 6 */,  
			  "void" /* 7 */, 
			  "struct" /*8*/ ];


var Look;

var inp;
var inp_pos;
	
var end_of_prog = false;

var compiled_asm = "";
var functions_asm = "";

var compiled_js_test = "";
var functions_js_test = "";

//////////////
var cur_scope; 

var scope_stack = new Array();
var user_func_codes = new Array();
var user_func_codes_pos = new Array(); // used for error reporting only
var report_pos = 0; // used for error reporting only
var last_success_pos = 0; // used for error reporting only

var global_scope = new VariableScope(true);

var const_vars=[];
var const_vars_type=[];

var last_expression_type;
var __ans_pos;

var rvalue = new Array(); // close to move constructor concept
var rvalue_pos = 0;

var keywords = ["bool", "real", "matrix", "string", "function", "functionptr", "void", "else", "if", "clear", 
				"function", "while", "loop0", "loop", "switch", "for", "do", "const", "enum", "class", "struct", "break", "continue", "default", "pragma"];



var linked_functions = [];

var ast_root = new Array();
var ast_postfix = new Array();

var anim_count = 0;
var func_uid;
var func_gen_names;

function AST(op, num_nodes, type, description){
	this.nodes = new Array(num_nodes);
	this.op = op;
	this.type = type;
	this.opts = {};
	this.description = description;
}

function ast_postfix_push(op, type, num_nodes, description)
{
	var ast = new AST(op, num_nodes, type, description);
	ast_postfix.push( ast );
	
	return ast;
}

function ast_from_postfix()
{
	var infinite = 0;
	while(ast_postfix.length > 1)
	{
		var node = ast_postfix.shift();
		var cur_op = node.op;
		var num_nodes = node.nodes.length;
		if (node.nodes == undefined || num_nodes == 0)
		{
			ast_postfix.push(node);
		}
		else
		{
			var ast = new AST(cur_op, num_nodes, node.type);
			ast.opts = node.opts;
			for (var i=0; i<num_nodes; ++i)
			{
				ast.nodes[i] = ast_postfix.pop();
			}
			
			ast_postfix.push(ast);
		}
		
		infinite++;
		if(infinite>100000) 
			Error_parse("Internal error: infinite ast_from_postfix");
	}
	
	return ast_postfix.shift();
	
}


function ast_generate_js(ast_node)
{	
	var op_func_map = { '+' : 'numeric.add' , '*' : 'numeric.mul' , '/' : 'numeric.div', '-' : 'numeric.sub', '==' : 'cortex.matrixsame', '!=' : '!cortex.matrixsame', '<=' : 'leq', '>=' : 'geq', '<' : 'le', '>' : 'ge', 
					'.*' : 'cortex.elm_mul', './' : 'cortex.elm_div'};
	var type_func_map = { 2 : 'r', 3 : 'm', 4: 's'};
	
	var js_code = "";
	/*if (ast_node==undefined)
		return "";*/
	
	if(ast_node.op == '(')
	{
		js_code = '(' + ast_generate_js(ast_node.nodes[0])+ ')';
	}
	else if (ast_node.op == '!')
	{
		js_code = '!(' + ast_generate_js(ast_node.nodes[0]) + ')';
	}
	else if (ast_node.op == "'")
	{
		js_code = 'numeric.transpose(' + ast_generate_js(ast_node.nodes[0]) + ")";
	}	
	else if(ast_node.op == '=')
	{
		if (ast_node.opts.dubmat == true)
			js_code = ast_generate_js(ast_node.nodes[0]) + ' ' + ast_node.op + " numeric.clone(" + ast_generate_js(ast_node.nodes[1]) + ')';
		else
			js_code = ast_generate_js(ast_node.nodes[0]) + ' ' + ast_node.op + ' ' + ast_generate_js(ast_node.nodes[1]);
	}	
	else if(ast_node.op == '[,,]') //multiassign
	{
		js_code = 'var __temp = ' + ast_generate_js(ast_node.nodes[0]) + ';\n';
		for(var i=0;i< ast_node.opts.names.length; i++)
		{
			if (ast_node.opts.dubmat)
				js_code += ast_node.opts.names[i] + ' = numeric.clone(__temp[' + i + ']' + (i!=ast_node.opts.names.length-1 ? ');\n' : ')');
			else
				js_code += ast_node.opts.names[i] + ' = __temp[' + i + ']' + (i!=ast_node.opts.names.length-1 ? ';\n' : '');
		}
	}
	else if(ast_node.op == '[]')
	{
		js_code = ast_generate_js(ast_node.nodes[0]) + '[' + ast_generate_js(ast_node.nodes[2]) + '][' + ast_generate_js(ast_node.nodes[1]) + ']';
	}
	else if(ast_node.op == '()')
	{
		js_code = ast_node.opts.fname + '(';
		for(var i=ast_node.nodes.length-1; i>=0; i--)
		{
			js_code += ast_generate_js(ast_node.nodes[i]) + ((i!=0) ? ', ' : '');
		}
		js_code += ')';
	}
	else if(ast_node.op == '[]=')
	{
		js_code = ast_generate_js(ast_node.nodes[0]) + '[' + ast_generate_js(ast_node.nodes[3]) + '][' + ast_generate_js(ast_node.nodes[2]) + '] = ' + ast_generate_js(ast_node.nodes[1]);
	}
	else if(ast_node.op == '[..]')
	{
		js_code = '[';
		for(var i=ast_node.opts.rows-1; i>=0; i--)
		{
			js_code += '[';
			for(var j=ast_node.opts.cols-1; j>=0; j--)
			{
				js_code += ast_generate_js(ast_node.nodes[i*ast_node.opts.cols+j]) + ((j!=0) ? ',' : '');
			}
			js_code += ']' + ((i!=0) ? ',' : '');
		}
		js_code += ']';
		//js_code = ast_generate_js(ast_node.nodes[0]) + '[' + ast_generate_js(ast_node.nodes[2]) + '][' + ast_generate_js(ast_node.nodes[3]) + '] = ' + ast_generate_js(ast_node.nodes[1]);
	}
	else if(ast_node.op == '[:]' || ast_node.op == '[:]=')
	{
		js_code = ast_node.opts.mode + '(' + ast_generate_js(ast_node.nodes[0]) ;
		for(var i=ast_node.nodes.length-1; i>=1; i--)
		{
			js_code += ', ' + ast_generate_js(ast_node.nodes[i]);
		}
		js_code += ")";
	}
	else if(ast_node.op == '+' || ast_node.op == '-' || ast_node.op == '*' || ast_node.op == '/' || ast_node.op == '.*' || ast_node.op == './' || IsRelop(ast_node.op) || ast_node.op == '&&'  || ast_node.op == '||')
	{
		if ( (ast_node.nodes[0].type == 2 && ast_node.nodes[1].type == 2) || 
			 (ast_node.nodes[0].type == 4 && ast_node.nodes[1].type == 2) || 
			 (ast_node.nodes[0].type == 2 && ast_node.nodes[1].type == 4) || 
			 (ast_node.nodes[0].type == 4 && ast_node.nodes[1].type == 4) ||
			 (ast_node.nodes[0].type == 1 && ast_node.nodes[1].type == 1))
			js_code = ast_generate_js(ast_node.nodes[1]) + ' ' +ast_node.op + ' ' +ast_generate_js(ast_node.nodes[0]);
		else if (ast_node.nodes[0].type == 3 && ast_node.nodes[1].type == 3 && ast_node.op == '*') 
			js_code = "cortex.dot(" + ast_generate_js(ast_node.nodes[1]) + ',' + ast_generate_js(ast_node.nodes[0]) + ")";
		else if ( (ast_node.nodes[0].type == 3 && ast_node.nodes[1].type == 3) && (ast_node.op == '+' || ast_node.op == '-')) 
			js_code = op_func_map[ast_node.op] + '(' + ast_generate_js(ast_node.nodes[1]) + ',' + ast_generate_js(ast_node.nodes[0]) + ")";
		else
		{
			var func_s = op_func_map[ast_node.op];
			var type_s = "";//"_" + type_func_map[ast_node.nodes[1].type] + "" + type_func_map[ast_node.nodes[0].type];
			js_code += func_s + type_s + "(" + ast_generate_js(ast_node.nodes[1]) + ", " + ast_generate_js(ast_node.nodes[0]) + ")";
		}
	}
	else if(ast_node.op == '$++' || ast_node.op == '$--')
	{
		js_code = ast_generate_js(ast_node.nodes[0]) + ast_node.op.slice(1, 3);
	}
	else if(ast_node.op == '++$' || ast_node.op == '--$')
	{
		if(ast_node.nodes[0].type == 2)
			js_code = ast_node.op.slice(0, 2) + ast_generate_js(ast_node.nodes[0]);
		else
			js_code = "numeric.addeq(" + ast_generate_js(ast_node.nodes[0]) + "," + (ast_node.op == '--$' ? "-1" : "1") + ")";
	}
	else
	{
		if ( const_vars[ast_node.op] != undefined )
			js_code = const_vars[ast_node.op];
		else
			js_code = ast_node.op;
	}
	
	return js_code;
}

function ast_collect_vars(ast_node, vars)
{
	if( ast_node.op == '=' && ast_node.opts.define)
		vars.push( ast_node.nodes[0].op);
		
	if( ast_node.op == '[,,]')
		for(var i=0;i< ast_node.opts.names.length; i++)
			if ( ast_node.opts.define[i])
				vars.push(ast_node.opts.names[i]);
		
	for(var i=ast_node.nodes.length-1; i>=0; i--)
	{
		ast_collect_vars(ast_node.nodes[i], vars)
	}
	
	return vars;
}

function ast_var_defines(root_node)
{
	var v = [], vs = "";
	ast_collect_vars(root_node, v);
	for(var i=0; i< v.length; i++)
		vs += (i==0 ? 'var ' : ', ') + v[i];
	if (v.length>0)
		vs += ';\n';
		
	return vs;
}

function ast_generate_code(no_expression)
{
	var root_node = ast_from_postfix();
				
	var defs = ast_var_defines(root_node);
		
	if (cur_scope == undefined && root_node.op != '[,,]' && !no_expression)
		__ans_pos = compiled_js_test.length + defs.length;
	
	return defs + ast_generate_js(root_node);
}

var Delegate = {};
Delegate.ftable_funcs = [];
Delegate.map = [];
Delegate.return_stack = [];

Delegate.LastReturnStack = function( )
{
	return this.return_stack[this.return_stack.length-1];
}

Delegate.Assign = function( type, read_delegate, write_delegate)
{
	if(type != 5 && type != 6)
		return;
		
	var is_global_w = cur_scope == undefined || cur_scope.get_var_type(write_delegate) == undefined;
	var full_name_write = is_global_w ? write_delegate : cur_scope.name + "_" + write_delegate;
	
	for(var i = 0;i < read_delegate.length; i++)
	{
		var is_global_r = cur_scope == undefined || cur_scope.get_var_type(read_delegate[i]) == undefined;
		var full_name_read = is_global_r ? read_delegate[i] : cur_scope.name + "_" + read_delegate[i];
		
		if (this.map[full_name_write] == undefined)
			this.map[full_name_write] = [];
			
		if(this.map[full_name_read] == undefined)
		{
			this.map[full_name_write].push(full_name_read);
		}
		else
		{
			for( var k = 0; this.map[full_name_read] && k < this.map[full_name_read].length; k++)
			{
				this.map[full_name_write].push(this.map[full_name_read][k]);
			}
		}
	}
}

Delegate.Ftable_suffix = function( param_types, param_count, return_types)
{
	var suffix = "";
	for (var i = param_count-1; i>=0; i--)
	{
		suffix += "_" + param_types[i];
	}
	
	return suffix + "$" + return_types.toString();
}

function GetLinkFunctionName(fname, param_types, param_count)
{
	var suffix = "";
	for (var i = param_count-1; i>=0; i--)
	{
		suffix += "_" + param_types[i];
	}
	
	return GetUniqueFName(fname , suffix);
}

function GetFtableFuncName(param_types, param_count, return_types)
{	
	return GetUniqueFName("", Delegate.Ftable_suffix(param_types, param_count, return_types) );
}

function GetUniqueFName(fname, param_suffix)
{
	var full_name = fname + param_suffix;
	if ( func_gen_names[full_name] === undefined)
	{
		func_gen_names[ full_name ] = fname + "_" + func_uid;
		func_uid++;
	}
	
	return func_gen_names[ full_name ];
}



function get_lineof_current_position()
{            
	var start, end;

	for (start = inp_pos-1; start > 0 ; start--)
	{
		if (inp[start] == '\n' || inp[start] == '\r')
		{
			start++;
			break;
		}
	}

	for (end = inp_pos-1; end < inp.Length && inp[end] != '\n' && inp[end] != '\r'; end++)
	{
	}

	return inp.substring(start,end+1);
}

function Error_parse(s)
{
	throw new Error(s);
}

function GetChar()
{
	if (inp_pos < inp.length)
	{
		Look = inp.charAt(inp_pos);
		inp_pos++;
	}
	else
	{
		Look = ";";		
		end_of_prog = true;
	}
}


function LookAhead()
{
	if (inp_pos < inp.length)
	{
		return inp.charAt(inp_pos);		
	}
	else
	{
		return '';
	}
}

function Match(x)
{
	if (Look != x)
	{
		Expected("'" + x + "'");
	}
	else
	{
		GetChar();
		SkipWhite();
	}
}

function CheckAhead(x)
{
	var a = inp.substring(inp_pos-1,inp_pos+x.length-1);
	if ( a== x && !IsAlNum( inp[inp_pos+x.length-1] ) )
	 return true;
	 
	return false;
}

function Expected(s)
{
	Error_parse(s + " expected");
}

function Emitln(s)
{
	compiled_asm += s + "\n";
}

function EmitFuncln(s)
{
	functions_asm += s + "\n";
}


function Emitln_ast(s)
{
	compiled_js_test += s + "\n";
}

function EmitFuncln_ast(s)
{
	functions_js_test += s + "\n";
}

function SkipWhite()
{	
	while(true)
	{
		var isThereChange = false;
		
		while (Look == ' ' || Look == '\t' || Look == '\n' || Look == '\r')
		{
			GetChar();
			isThereChange = true;
		}
		
		if (Look == '/' && LookAhead()  == '/')
		{
			while( 1)
			{					
				if (end_of_prog==true)
					break;
				if (Look == '\n')
				{
					//if (Look != '/' && LookAhead()  != '/')
					{
						break;
					}
				}
				
				GetChar();
			}
			
			isThereChange = true;
		}
		
		if (Look == '/' && LookAhead()  == '*')
		{
			while( 1)
			{					
				if (end_of_prog==true)
					break;
				if (Look == '*' && LookAhead()  == '/')
				{
					GetChar();
					GetChar();
					break;
				}
				
				GetChar();
			}
			
			isThereChange = true;
		}
		
		if(isThereChange ==false)
			break;
	}
}

function IsWhite()
{
	if (Look == ' ' || Look == '\t' || Look == '\n' || Look == '\r')
		return true;
	else
		return false;
}

function IsAlpha(c)
{			
	return ( (c>='a') && (c<='z')) || ((c>='A') && (c<='Z')) || c=='_';
}

function  IsAlNum(c)
{			
	return (IsAlpha(c) || ( c>='0') && (c<='9') );
}

function IsDigit(c)
{
	var code = c.charCodeAt(0);
	return ((code>=48) && (code<=57)) || code==46;
} 

function IsHexChar(c)
{
	var code = c.charCodeAt(0);
	return ((code>=48) && (code<=57)) || ( ( (c>='a') && (c<='f')) || ((c>='A') && (c<='F')) );
} 

function IsAddop(c)
{
	return c == '+' || c == '-';
}

//Recognize a Relop 
function IsRelop(c, cnext)
{
	var op = c + ((cnext == undefined) ? "" : cnext);
	return op == '==' || op == '!=' || c == '<' || c == '>' || op == '<=' || op == '>=';
}

function EscapeString(s)
{
	var r = "";
	for(var i = 0;i < s.length; i++)
	{
		switch(s[i])
		{
			case '\n' : r += '\\n';break;
			case '\t' : r += '\\t';break;
			case '\\' : r += '\\\\';break;
			case '"' : r += '\\\"';break;
			case "'" : r += '\\\'';break;
			default: r += s[i];
		}
	}
	
	return r;
}

function GetString()
{
	var Name = "";
	
	while (Look != '"')
	{
		if (Look == '\\')
		{
			GetChar();
			switch(Look)
			{
				case 'n' : Name += '\n';break;
				case 't' : Name += '\t';break;
				case '\\' : Name += '\\';break;
				case '\"' : Name += '\"';break;
				case '\'' : Name += '\'';break;
				default: Error_parse("Unrecognized escape sequence : \\" + Look );
			}
		}
		else
			Name += Look;
			
		GetChar();
	}
	
	return Name;
}

function GetName()
{
	var Name = "";

	if (!IsAlpha(Look))
		Expected("Name");

	while (IsAlNum(Look))
	{
		Name += Look;
		GetChar();
	}

	SkipWhite();
	return Name;
}

function GetHex()
{
	var Value = "";
	
	GetChar(); // 0
	GetChar(); // x
	
	while (IsHexChar(Look))
	{
		Value += Look;
		GetChar();
	}
	
	SkipWhite();
	return parseInt("0x" + Value);
}

function GetNum()
{
	var Value = "";
	
	if (Look == '0' && (LookAhead() == 'x' || LookAhead() == 'X'))
		return GetHex();

	if (!IsDigit(Look))
		Expected("Real number");

	while (IsDigit(Look))
	{
		Value += Look;
		GetChar();
	}
	
	if(Look=='e' || Look=='E')
	{
		Value += Look;
		GetChar();
		if (Look=='-')
		{
			Value += Look;
			GetChar();
		}
			
		if (!IsDigit(Look))
			Error_parse("Error in number format.");
		
		while (IsDigit(Look))
		{
			if (Look == '.')
				Error_parse("Error in number format.");
				
			Value += Look;
			GetChar();			
		}
	}

	SkipWhite();

	return parseFloat(Value);
}

function GetMatrix(is_verbatim)
{
	var first_sep;
	var second_sep;
	var num_cols = -1, cur_col = 0;
	var num_rows = 1;
			
	while( 1)
	{
		var type
		
		if(!is_verbatim)
		{
			type = ArithmeticExpr();
		}
		else
		{
			type = 2;
			if(Look == '-') // ugly need fix here
			{
				Match('-');
				var num = -GetNum();
			}
			else
				var num = GetNum();
				
				Emitln("asm_reg0_real =" + num + ";");
				
				ast_postfix_push(num, 2, 0, "GetMatrix");
		}
		
		if (type == 2)
			PushLast(type);
		else 
		{
			Error_parse("Only reals are allowed for matrix elements.");
		}
		
		
		cur_col++;
		SkipWhite();
		if (Look==',')
		{
			Match(',');			
		}
		
		if (Look==']')
		{
			if (num_cols!=-1 && num_cols !=cur_col)
			{
				Error_parse("Matrix size mismatch.");
			}
		   break;
		}
		else if(Look==';')
		{
			Match(';');
			if (num_cols==-1)
			{
			   num_cols = cur_col;
			}
			else if (num_cols !=cur_col)
			{
				Error_parse("Matrix size mismatch.");
			}
			
			num_rows++;
			cur_col = 0;
		};
	}
	
	num_cols = cur_col;
	
	Emitln("asm_load_matrix(" + num_rows + "," + num_cols + ");");
	
	var ast=ast_postfix_push("[..]", 3, num_rows * num_cols, "GetMatrix");
	ast.opts.rows = num_rows;
	ast.opts.cols = num_cols;
	
	rvalue[rvalue_pos] = true;
}




////////////// PARSER
function AddSubOp(top_type, op)
{
	var prefix, suffix="";
	if (op=='+')
	{
		Match('+');
		prefix = 'asm_add';
	}
	else
	{
		Match('-');
		prefix = 'asm_sub';
	}
	
	var reg0_type = Term();	
	
	var opmode = top_type + "_" + reg0_type;
	
	
	
	PopReg1(top_type);
	switch(opmode)
	{
		case "2_2":
			Emitln( prefix +"_real();" );
			return 2;
		case "2_3":
			Emitln( prefix +"_rm();" );
			rvalue[rvalue_pos] = true;
			return 3;
		case "3_2":
			Emitln( prefix +"_mr();" );
			rvalue[rvalue_pos] = true;
			return 3;
		case "3_3":
			Emitln( prefix +"_mm();" );
			
			rvalue[rvalue_pos] = true;
			return 3;
		case "4_2":
		case "2_4":
		case "4_4":
			if(op != '-')
			{
				if(opmode == "4_2")
					suffix = "_sr";
				if(opmode == "2_4")
					suffix = "_rs";
				Emitln( "asm_str_concat" + suffix + " ();" );
				rvalue[rvalue_pos] = true;
				return 4;
			}
			break;
	}
	
	Error_parse( "'" + op +"' operator is not supported for types: '" + types[top_type] + "' and '" + types[reg0_type] + "'");
}

function MulDivOpElm(top_type, op)
{
	var instruction;
	if (op == './')
	{
		Match('.');
		Match('/');
		instruction = 'asm_elm_div';
	}
	else if (op == '.*')
	{
		Match('.');
		Match('*');
		instruction = 'asm_elm_mul';
	}
	
	var reg0_type = SignedFactor();
	
	if (top_type != 3 || reg0_type != 3)
		Error_parse("Matrix type required for element wise matrix operations");
	
	PopReg1(top_type);
	Emitln( instruction +"();" );
	rvalue[rvalue_pos] = true;
	return 3;
}

function MulDivOp(top_type, op)
{
	var prefix;
	if (op=='*')
	{
		Match('*');
		prefix = 'asm_mul';
	}
	else
	{
		Match('/');
		prefix = 'asm_div';
	}
	
	var reg0_type = SignedFactor();
	
	
	
	if (top_type == 2)
	{
		if (reg0_type == 2)
		{
			PopReg1(top_type);
			Emitln( prefix +"_real();" );
						
			return 2;
		}
		else if (reg0_type == 3)
		{
			if (op=='*')
			{
				PopReg1(top_type);
				Emitln( prefix +"_rm();" );
				rvalue[rvalue_pos] = true;
				return 3;
			}
			else
			{
				Error_parse("Real division by matrix is undefined.");
			}
		}		
	}
	else if (top_type == 3)
	{
		if (reg0_type == 2)
		{
			PopReg1(top_type);
			Emitln( prefix +"_mr();" );
			rvalue[rvalue_pos] = true;
			return 3;
		}
		else if(reg0_type == 3)
		{
			if (op=='*')
			{
				PopReg1(top_type);
				Emitln( prefix +"_mm();" );
				rvalue[rvalue_pos] = true;
				return 3;
			}
			else
			{
				Error_parse("Matrix division is undefined.");
				return 3;
			}
		}
	}
	
	Error_parse( "'" + op +"' operator is not supported for types: '" + types[top_type] + "' and '" + types[reg0_type] + "'");
}

function IncDecOpPostfix(Name, op)
{
	var type = comp_get_var_type(Name);
	
	if(type == 3)
		Error_parse("Use prefix notation for matrix increment/decrement for efficiency. (ex : '++" + Name + "' )"); // postfix for matrices seem inefficient so disabled for now
		
	if( type != 2)
		Error_parse("Increment decrement operator is only supported for reals"); // postfix for matrices seem inefficient so disabled for now
			
	EmitReadVar(Name, type);
	
	if(type == 2)
	{
		if (op == '+')
		{
			Emitln( "asm_reg0_real++;" );			
			EmitWriteVar(Name, type);
			Emitln("asm_reg0_real--;");
			ast_postfix_push(Name, type, 0, "IncDecOpPostfix");
			ast_postfix_push("$++", type, 1, "IncDecOpPostfix");
		}
		else
		{
			Emitln( "asm_reg0_real--;" );			
			EmitWriteVar(Name, type);
			Emitln("asm_reg0_real++;");
			ast_postfix_push(Name, type, 0, "IncDecOpPostfix");
			ast_postfix_push("$--", type, 1, "IncDecOpPostfix");
		}
	}
	
	
	return type;
}

function Transpose()
{
	var type;
	type = IncDecPrefix();
	
	if(Look == "'")
	{
		Match("'");
		if(type != 3)
			Error_parse("Can not transpose non matrices");
		
		rvalue[rvalue_pos] = true;
		Emitln("asm_reg0_transpose();");
		
		ast_postfix_push("'", type, 1, "transpose");
	}
		
	return type;
}

function IncDecPrefix()
{
	var type;
	
	if( (Look == '+' && LookAhead() == '+') || Look == '-' && LookAhead() == '-')
	{
		var op = Look;
		Match(op);
		Match(op);
		var Name = GetName();
		
		type = comp_get_var_type(Name);
		
		if( type != 2 && type != 3)
			Error_parse("Increment decrement operator is only supported for reals and matrices");
		
		if(type == 2)
		{
			EmitReadVar(Name,2);
			if(op == '+')
				Emitln("asm_reg0_real++;");
			else
				Emitln("asm_reg0_real--;");
			EmitWriteVar(Name,2);
		}
		else if (type ==3)
		{
			EmitReadVar(Name, 3);
			if(op == '+')
				Emitln( "asm_inc_mat();" );
			else
				Emitln( "asm_dec_mat();" );
		}
		
		ast_postfix_push(Name, type, 0, "IncDecPrefix");
		ast_postfix_push(op+op + "$", type, 1, "IncDecPrefix");
	}
	else
	{
		type = Factor();
	}
	
	return type;
}

///////////////////////////////////////
//Parse and Translate a Relation
function BoolOp(top_type, op)
{
	
	var prefix;
	
	if (op=='||')
	{
		Match('|');
		Match('|');
		prefix = 'asm_or_bool';
	}
	else if ( op == '&&')
	{
		Match('&');
		Match('&');
		prefix = 'asm_and_bool';
	}
	else if ( op == '!')
	{
		Match('!');		
		prefix = 'asm_not_bool';
	}
	else
	{
		Error_parse("Invalid bool op : '" + op + "'.");
	}
	
	var reg0_type = BoolTerm();	
	if (reg0_type!=1)
	{
		if (op != '!' || top_type!=1)
		{
			Error_parse('Boolean operations are supported only for boolean type');
			return 1;
		}
	}
	
	if (op != '!')
	{
		PopReg1(top_type);
	}
	Emitln( prefix + '();');
	
	
	ast_postfix_push(op, reg0_type, op == '!' ? 1 : 2);
	
	return reg0_type;
} 

function RelOp(top_type, op)
{	
	var reg0_type = ArithmeticExpr();
	
	if (reg0_type ==4 && top_type==4)
	{
		if (op=='==')
		{
			prefix = 'asm_str_eq';
		}
		else if ( op == '!=')
		{		
			prefix = 'asm_str_neq';
		}
		else
		{
			Error_parse("Invalid string operator.");
		}
		
		PopReg1(top_type);
		Emitln( prefix + '();');
		
		ast_postfix_push(op, 1, 2);
	
		return 1;
	}
	else if ((reg0_type == 6 || reg0_type ==5) && (top_type == 6 || top_type == 5))
	{
		if (op=='==')
		{
			PopReg1(top_type);
			Emitln( 'asm_eq()');
		}
		else if ( op == '!=')
		{		
			PopReg1(top_type);
			Emitln( 'asm_neq()');
		}
		
		ast_postfix_push(op, 1, 2);
		
		return 1;
	}
	else if(reg0_type ==3 && top_type==3)
	{
		if (op=='==')
		{
			prefix = 'asm_matrix_eq';
		}
		else if ( op == '!=')
		{		
			prefix = 'asm_matrix_neq';
		}
		else
		{
			Error_parse("Invalid matrix operator.");
		}
		
		PopReg1(top_type);
		Emitln( prefix + '();');
		
		ast_postfix_push(op, 1, 2);
		
		return 1;
	}
	
	var prefix;
	if (op=='==')
	{
		prefix = 'asm_eq';
	}
	else if ( op == '!=')
	{		
		prefix = 'asm_neq';
	}
	else if ( op == '<')
	{
		prefix = 'asm_le';
	}
	else if ( op == '>')
	{		
		prefix = 'asm_ge';
	}
	else if ( op == '>=')
	{		
		prefix = 'asm_geq';
	}
	else if ( op == '<=')
	{		
		prefix = 'asm_leq';
	}
	else
	{
		Error_parse("Invalid bool op : '" + op + "'.");
	}
	
	
	if (reg0_type !=2 || top_type!=2)
	{
		Error_parse("Relational operations are not supported for the given types: '" + types[reg0_type] + "' and '" + types[top_type] + "'");
		return 2;
	}	
	
	
    ast_postfix_push(op, 1, 2);
	
	PopReg1(top_type);
	Emitln( prefix + '();');
	
	return 1;
}

function Relation()
{
	var type = ArithmeticExpr();
	var r;
	if (IsRelop(Look, LookAhead() ))
	{
		PushLast(type);
		switch(Look)
		{
		case '=': 
			Match('=');
			Match('=');
			type = RelOp(type,'==');
			break;
		case '!': 
			Match('!');
			Match('=');
			type = RelOp(type,'!=');
			break;
		case '<': 
			Match('<');
			if (Look=='=')
			{
				Match('=');
				type = RelOp(type,'<=');
			}
			else
				type = RelOp(type,'<');
			break;
		case '>': 
			Match('>');
			if (Look=='=')
			{
				Match('=');
				type = RelOp(type,'>=');
			}
			else
				type = RelOp(type,'>');
			break;
		}
	}
	else
	{
		r = type;
	}
	
	return type;
}

//Parse and Translate a Boolean Factor with NOT
function NotFactor()
{
	var type;
	if (Look == '!') 
	{		
		type = BoolOp(type, '!');
	}
	else
		type = Relation();

	return type;
}

//Parse and Translate a Boolean Term
function BoolTerm()
{
	var type = NotFactor();
	while (Look == '&' && LookAhead() == '&')
	{
		PushLast(type);		
		type = BoolOp(type, '&&');
	}

	return type;
}

//Parse and Translate an Expression
function ExpressionNew()
{
	Delegate.return_stack.push([]);
	
	var type = Expression();
	
	Delegate.return_stack.pop();
	
	last_expression_type = type;
	
	return type;
}

//Parse and Translate an Expression
function Expression()
{
	var type;
	
	type = BoolTerm();
	while (Look == '|' && LookAhead() == '|')
	{
		PushLast(type);
		type = BoolOp(type, '||');
	}
	
	
	return type;
}


function Term()
{
	var type;
	
	type = SignedFactor();
	while (Look == '*' || Look == '/' || (Look == '.' && LookAhead() == '*')|| (Look == '.' && LookAhead() == '/'))
	{
		PushLast(type);
		switch (Look)
		{
		case '*':
			type = MulDivOp(type,'*');
			ast_postfix_push("*", type, 2);
			break;
		case '/':
			type = MulDivOp(type,'/');
			ast_postfix_push("/", type, 2);
			break;
		case '.':
			var op = '.' + LookAhead();
			type = MulDivOpElm(type, op);
			ast_postfix_push(op, type, 2);
			break;
		default: Expected("Mulop");
			break;
		}
		
		
	}

	return type;
} 

function Factor()
{
	var type;
		
	if (Look == '(')
	{
		Match('(');
		type = Expression();
		ast_postfix_push('(', type, 1);
		
		Match(')');
	}
	else if (IsAlpha(Look))
	{
		type = Ident();
	}
	else if (Look == '[')
	{
		Match('[');
		GetMatrix(false);
		Match(']');
		type = 3;
	}
	else if (Look == '@' && LookAhead() == '[')
	{
		Match('@');
		Match('[');
		GetMatrix(true);
		Match(']');
		type = 3;
	}
	else if (Look == '"')
	{
		type = 4;
		GetChar();
		var str = EscapeString(GetString());
		Emitln("asm_reg0 = \"" + str + "\";");
		ast_postfix_push( '"' + str + '"', type, 0);
		Match('"');
	}
	else
	{
		var num = GetNum();
		Emitln("asm_reg0_real =" + num + ";");
		type = 2;
		
		ast_postfix_push(num, type, 0);
	}

	return type;
}


function SignedFactor()
{
	var type;
	
	if (Look == '+' && LookAhead() != '+')
	{
		GetChar();
	}
	if (Look == '-' && LookAhead() != '-') //unary
	{
		GetChar();
		if (IsDigit(Look))
		{	
			var num = -GetNum(); // ex : a = 2*-2 
			Emitln("asm_reg0_real = " + num +";");
			type = 2;
			
			ast_postfix_push(num, 2 , 0, "SignedFactor");
		}
		else
		{
			Emitln("asm_reg1_real = 0");
			
			
			ast_postfix_push('0', 2 , 0, "SignedFactor");
			
			type  = Transpose();
			if(type == 2)
				Emitln("asm_sub_real();");
			else if(type == 3)
				Emitln("asm_sub_rm();");
			else
				Error_parse("Unary '-' only supported for reals and matrices");
			
			ast_postfix_push('-', type , 2, "SignedFactor");
			ast_postfix_push("(", type , 1, "SignedFactor");
		}
	}
	else
	{
		type = Transpose();
	}

	return type;
}



function FuncCall(Name, IsCmd, IsDelegate)
{
	var count = 0;
	var params_type=new Array();
	var params_delegate=new Array();
	
		
	if(!IsCmd)
	{
		Match('(');
		
		// parse function params
		while( Look != ')')
		{
			Delegate.return_stack.push([]);
			params_type[count] = Expression();
			params_delegate[count] = Delegate.LastReturnStack();
			Delegate.return_stack.pop();
			PushLast(params_type[count]);
			count++;
			if (Look != ')')
				Match(',');
		}
		
		Match(')');
	}
	else
	{
		while( Look != ';')
		{
			params_type[count] = 4;
			var param_name = GetName();
			Emitln('asm_reg0 = "' + param_name + '"');
			ast_postfix_push( '"' + param_name + '"', 4, 0);
			PushLast(params_type[count]);
			count++;
		}
	}
	
	var return_types;
	var return_delegates = {};
	if (!IsDelegate)
		return_types = LinkFunc(Name, count, params_type, return_delegates, params_delegate);
	else
	{
		return_types = LinkDelegation(Name, count, params_type, return_delegates, params_delegate);
	}
	
	Delegate.return_stack[Delegate.return_stack.length-1] = Delegate.return_stack[Delegate.return_stack.length-1].concat(return_delegates.delegates);
	
	var func_name = GetLinkFunctionName(Name, params_type, count);
	
	if(!IsDelegate)
	{
		Emitln('asm_func_' + func_name + "();");
				
		var ast_node = ast_postfix_push("()", return_types[0], count);
		ast_node.opts.fname = 'asm_func_' + func_name;
	}
	else
	{
		var is_global = cur_scope == undefined || cur_scope.get_var_type(Name) == undefined;
		var full_name = is_global ? Name : cur_scope.name + "_" + Name;
		var suffix = GetFtableFuncName( params_type, count, return_types );
		EmitReadVar(Name, 6);
		Emitln("asm_fjump_table_" + suffix + "(asm_reg0);//asm_call_reg0();");
		
		var ast_node = ast_postfix_push("()", return_types[0], count);
		ast_node.opts.fname = "asm_fjump_table_" + suffix + "("+ Name + ")";
	}
	
	//Delegate.return_stack = "";

	return return_types;
}

function LinkDelegation(Name, count, params_type, return_delegates, params_delegate)
{
	var return_types;
	var is_global = cur_scope == undefined || cur_scope.get_var_type(Name) == undefined;
	var full_name = is_global ? Name : cur_scope.name + "_" + Name;
	return_types = LinkFunc(Delegate.map[full_name][0], count, params_type, return_delegates, params_delegate);
	
	Delegate.to_be_linked.push({ Name : full_name, count : count, param_types : params_type, return_delegates : return_delegates, params_delegate : params_delegate, return_types :return_types});
	
	var suffix = Delegate.Ftable_suffix( params_type, count, return_types );
	
	if(Delegate.ftable_funcs[suffix] == undefined)
		Delegate.ftable_funcs[suffix] = [];
	
	Delegate.ftable_funcs[suffix][Delegate.map[full_name][0]] = const_vars[Delegate.map[full_name][0]];
	
	return return_types;
}

function LinkDelegateFunctions()
{
	for(var i =0;i< Delegate.to_be_linked.length; i++)
	{
		//Delegate.to_be_linked.push({ Name : full_name, count : count, param_types : params_type, return_delegates : return_delegates, params_delegate : params_delegate});
		var full_name = Delegate.to_be_linked[i].Name;
		var count = Delegate.to_be_linked[i].count;
		var params_type  = Delegate.to_be_linked[i].param_types;
		var return_delegates;
		var return_types  = Delegate.to_be_linked[i].return_types;
		var params_delegate = Delegate.to_be_linked[i].params_delegate;
		
		for(var k = 1;k < Delegate.map[full_name].length;k++)
		{
			var suffix = Delegate.Ftable_suffix( params_type, count, return_types );
			
			var return_delegates_k = {};
			var r_s = LinkFunc(Delegate.map[full_name][k], count, params_type, return_delegates_k , params_delegate);
			
			if(Delegate.ftable_funcs[suffix] == undefined)
				Delegate.ftable_funcs[suffix] = [];
		
			Delegate.ftable_funcs[suffix][Delegate.map[full_name][k]] = const_vars[Delegate.map[full_name][k]];
			
			//if (r_s.toString() != return_types.toString())
				//Error_parse("Return type of delegate is different for functions :'" + delegate_map[Name][0] + "' and '" + delegate_map[Name][k] + "'");
		}
	}
}

function StringIndexer(Name)
{
	Match('[');
	var type = Expression();
	Match(']');
	
	if (type != 2)
	{
		Error_parse("Invalid indexer type.");
	}
	
	PushLast(type);
	
	EmitReadVar(Name, type);
	
	PushLast(type);	
}

// A[1, :]
function IndexerOnlyColon(multiple, isrow)
{
	Match(':');
		
	Emitln("asm_reg0_real = 0;");
	PushLast(2);
	Emitln("asm_reg0_real = -1;");
	PushLast(2);
	
	ast_postfix_push("0", 2, 0, "IndexerOnlyColon");
	ast_postfix_push("-1", 2, 0, "IndexerOnlyColon");
	
	if (isrow)
		multiple = 100; 
	else
	{
		multiple = (multiple == 100) ? 102 : 101;
	}
	
	return multiple;
}

// A[1:3, 2:4]
function IndexColonRange(multiple, isrow)
{
	Match(':');
	var type = Expression();

	if (type!=2)
	{
		Error_parse("Invalid indexer type.");
	}
	
	PushLast(type);
	
	if (isrow)
		multiple = 100; 
	else
	{
		multiple = (multiple == 100) ? 102 : 101;
	}
	
	return multiple;
}

function MatrixIndexer(Name)
{
	var vector = false; //,mode;
	var multiple = 0;
	var type;
	//var rowbegin, rowend;
	
	Match('[');
	
	if (Look == ':')
	{
		multiple = IndexerOnlyColon(multiple, true);
	}
	else
	{
		type = Expression();
		
		if (type!=2)
		{
			Error_parse("Invalid indexer type.");
		}
		
		PushLast(type);
		
		if (Look == ':')
		{
			multiple = IndexColonRange(multiple, true);
		}
	}
	
	
	if (Look==',')
	{
		Match(',');
		//mode = 1; // , mode
	}
	else if (Look==']')
	{
		Match(']');
		
		if(Look=='[')
			Match('[');
		else
			vector = true;
		//mode = 2; // c style
	}
	
	if (Look == ':')
	{
		multiple = IndexerOnlyColon(multiple, false);
	}
	else
	{
		if (!vector)
		{
			type = Expression();
		}
		else
		{
			Emitln("asm_reg0_real = 0;");
			ast_postfix_push("0", 2, 0);
			type = 2;
		}
			
		if (type!=2)
		{
			Error_parse("Invalid indexer type.");
		}

		PushLast(type);	
		
		if (Look == ':')
		{
			multiple = IndexColonRange(multiple, false);
		}
	}
	
	EmitReadVar(Name, 3);
	
	PushLast(3);
	
	if (!vector)
		Match(']');
		
	return multiple;
}

function MemberAccess()
{
	
}

function Ident()
{
	var Name = GetName();
	
	while(Look == '.' && (LookAhead() != '*' && LookAhead() != '/'))
	{
		GetChar();
		Name += '.' + GetName();
	}

	var type = comp_try_get_var_type(Name);
	
	if (Look == '(')
	{
		if (type == 6)  // check if function delegate
		{
			type = FuncCall(Name, false, true);
		}
		else
		{
			var return_types = FuncCall(Name);
			ClearUnusedParams(return_types, 1, return_types.length);
			type = return_types[0];
		}
	}
	else if (Look == '[')
	{
		type = comp_get_var_type(Name);
		
		if (type==4)
		{
			StringIndexer(Name);
			Emitln("asm_string_get_elm();");
			type = 2;
		}
		else if (type==3)
		{
			var multiple = MatrixIndexer(Name);
			
			if( Look == '=' && !IsRelop(Look, LookAhead()))
			{
				type = AssignmentOp(Name, true, multiple);
			}
			else
			{
				if (!multiple)
				{
					Emitln("asm_matrix_get_elm();");
					
					ast_postfix_push( Name, 3, 0);
					ast_postfix_push( "[]", 2, 3);
					
					type = 2;
				}
				else
				{
					ast_postfix_push(Name, 3, 0);
				
					switch(multiple)
					{
						case 102:
							Emitln("asm_matrix_get_slice();");
							var ast = ast_postfix_push("[:]", type, 5, "asm_matrix_get_slice()");
							ast.opts.mode = "cortex.getslice";
							break;
						case 100:
							Emitln("asm_matrix_get_slice(1); // col ");
							var ast = ast_postfix_push("[:]", type, 4, "asm_matrix_get_slice(1)");
							ast.opts.mode = "cortex.getcol";
							break;
						case 101:
							Emitln("asm_matrix_get_slice(2); // row");
							var ast = ast_postfix_push("[:]", type, 4, "asm_matrix_get_slice(2)");
							ast.opts.mode = "cortex.getrow";
							break;
					}
					
					rvalue[rvalue_pos] = true;
					type = 3;
				}
			}
		}
		else
			Error_parse("Indexer [] operator only works for matrices and strings.");
	}
	else
	{
		if( Look == '=' && !IsRelop(Look, LookAhead()))
		{
			type = AssignmentOp(Name, false, 0);
		}
		else if( Look == '+' && LookAhead() == '+')
		{
			Match("+");
			Match("+");
			type = IncDecOpPostfix(Name, '+');
		}
		else if( Look == '-' && LookAhead() == '-')
		{
			Match("-");
			Match("-");
			type = IncDecOpPostfix(Name, '-');
		}
		else
		{
			type = comp_get_var_type(Name);
			
			EmitReadVar(Name, type);
			ast_postfix_push(Name, type, 0);
			
			if (type == 5 || type == 6)
			{
				Delegate.return_stack[Delegate.return_stack.length-1] = [Name];
			}
		}
	}

	return type;
}

function PopReg0(type)
{
	if(type == 1 || type == 2)
		Emitln("asm_pop_real();");
	else
		Emitln("asm_pop();");
}

function PopReg1(type)
{
	if(type == 1 || type == 2)
		Emitln("asm_pop1_real();");
	else
		Emitln("asm_pop1();");
}

function PushLast(type)
{
	if(type == 1 || type == 2)
		Emitln("asm_push_real();");
	else
		Emitln("asm_push();");
	
}

function VariableScope(use_heap)
{
	this.vars = [];
	this.vars_type = [];
	this.vars_rel_pos = [];
	this.stack_rel_pos = 0;
	this.vars_deduced = [];
	
	this.param_count_ref = 0;
	this.return_type;
	this.rvalue_all = true;
	
	this.for_while_track = new Array();
	
	this.returned_delegates = new Array();
	
	this.define_var = function(name, type)
	{
		for(var i=0;i<keywords.length;i++)
			if (keywords[i] == name)
				Error_parse("Can not define reserved words as variables");
			
		if(this.vars[name]===undefined)
		{
			this.vars[name] = 0;
			
			this.vars_rel_pos[name] = this.stack_rel_pos++;
			
			if(use_heap)
				;//Emitln("asm_heap_pointer++;");
			else
				Emitln("asm_sp++;");
		}
		else
		{
			if(this.vars_deduced[name]!==undefined && this.vars_deduced[name] != type)
			{		
				Error_parse("Deduced type is different from previous defined type : '" + name + "'.");
			}	
		}
		
		this.vars_type[name] = type;
		this.vars_deduced[name] = type;
	}
	
	this.define_param = function(name, type, rel_pos)
	{
		for(var i=0;i<keywords.length;i++)
			if (keywords[i] == name)
				Error_parse("Can not define reserved words as variables");
				
		if(this.vars[name]===undefined)
		{
			this.vars[name] = 0;
			this.vars_type[name] = type;
			this.vars_rel_pos[name] = rel_pos;
			this.param_count_ref++;
		}
		else
		{
			if(this.vars_deduced[name]!==undefined && this.vars_deduced[name] != type)
			{		
				Error_parse("Deduced type is different from previous defined type : '" + name + "'.");
			}	
		}
		
		this.vars_deduced[name] = type;
	}
	
	this.get_var_type = function(name)
	{
		return this.vars_type[name];
	}
	
	this.clear_all = function()
	{
		this.vars = [];
		this.vars_type = [];
		this.vars_rel_pos = [];
		this.stack_rel_pos = 0;
		this.vars_deduced = [];
	}
	
	this.clear_var = function(name)
	{		
		delete this.vars[name]; 
	
		delete this.vars_type[name]; 
		
		delete this.vars_deduced[name]; 
	}
	
	this.get_var_value = function(name, type)
	{
		if(!use_heap)
			Error_parse("Internal error. Heap")
			
		return heap[this.vars_rel_pos[name]];
	}
}


function ArithmeticExpr()
{
	var type;
	
	if (IsAddop(Look) && Look != LookAhead())
	{
		type = 2;
		Emitln("asm_reg0_real = 0;");
		
		ast_postfix_push('0', 2 , 0, "ArithmeticExpr");
	}
	else
	{
		type = Term();
	}

	while ( (Look == '+' && LookAhead() !='+') || (Look == '-' && LookAhead() !='-') )
	{
	    PushLast(type);
		switch (Look)
		{
		case '+':
			type = AddSubOp(type, '+');
			ast_postfix_push('+', type, 2);
			break;
		case '-':
			type = AddSubOp(type, '-');
			ast_postfix_push('-', type, 2);
			break;
		default: Expected("Addop");
			break;
		}
	}

	return type;
}


function DoFunction()
{
	var cur_pos = inp_pos-1;
	
	var braces = 0, firstBracesMet = false;
	
	var rtype_name = GetName();
	var rtype = 2;
	
	if (rtype_name != "function")
		for (var i=0;i<types.length;i++)
			if (types[i] == rtype_name) rtype = i;
	
	var Name = GetName();
	
	user_func_codes_pos[Name] = cur_pos;
	
	Name = Name.replace(".", "_");
	
	var code = "function "+ Name;
	code += Look;
	
	while(true)
	{
		GetChar();
		code += Look;
		
		if (Look =='{')
		{
		   braces++;
		   firstBracesMet =true;
		}
		else if (Look=='}')
			braces--;
		
		if(braces==0 && firstBracesMet)
			break;
		
		if(end_of_prog)
			Error_parse("Unexpected end of file.");
	}
	
	Match('}');
	
	if(cur_scope)
	{
		Error_parse("Inline functions are not supported.");
	}
	
	if (user_func_codes[Name] != undefined)
		Error_parse("Function already defined: '" + Name + "'.");
	
	user_func_codes[Name] = code;
	
	comp_define_var_const(Name, function_list.length , 5);
	function_list.push( new FunctionDefs(Name, [], [rtype] , "user", true) );
	//comp_define_var(Name, 5);
	
}

function DoFunctionLink(func_name, code, params_count, params_type, return_delegates, params_delegate)
{
	var old_inp = inp;
	var old_inp_pos = inp_pos;
	var old_look = Look;
	var param_description = "";
	
	inp = code;
	inp_pos = 0;
	end_of_prog = false; 
	
	GetChar();
	SkipWhite();
	
	if (GetName() != 'function')
		Error_parse("Internal Error. ");
		
	var fName = GetName();
	
	var test_def = 'function asm_func_' + func_name + '(';
	
	
	Match('(');
	// parse function params
	var proto_param_count = 0;
	var proto_param_names=new Array();
	while( Look != ')')
	{		   
	   proto_param_names[proto_param_count] = GetName();
	   
	   test_def += proto_param_names[proto_param_count];
	   param_description += types[ params_type[ proto_param_count] ] + " ";
	   
	   proto_param_count++;
	   if (Look != ')')
	   {
		 Match(',');
		 test_def += ', ';
	   }
	}
	Match(')');
	
	if ( proto_param_count != params_count)
	{
		Error_parse("Invalid number of parameters.");
	}
	
	var compiled_js_saved = compiled_asm;
	var compiled_js_test_saved = compiled_js_test;
	var ast_postfix_saved = ast_postfix.slice(); // dublicate
	
	compiled_asm = "";
	compiled_js_test = "";
	ast_postfix = new Array();
	
	Emitln_ast( test_def + ')    // ' + param_description + '\n{');
	
	Emitln( 'function asm_func_' + func_name + '()  // ' + param_description);
	Emitln( '{');
	
	
	cur_scope = new VariableScope();
	cur_scope.name = fName;
	scope_stack.push(cur_scope);
	
	Delegate.return_stack.push([]);
	
	for(var i=0;i < params_count; i++)
	{
		
		if(params_type[i] == 5 || params_type[i] == 6)
		{
			cur_scope.define_param(proto_param_names[i], 6, -params_count-1 +i);
			Delegate.Assign(params_type[i], params_delegate[i], proto_param_names[i]);
		}
		else
		{
			cur_scope.define_param(proto_param_names[i], params_type[i], -params_count-1 +i);
		}
		
	}
	
	Emitln("stack[asm_sp++] = asm_bp;");
	Emitln("asm_bp = asm_sp;");
	
	if (!StatementBlock())
	{
		if (cur_scope.return_type == undefined || cur_scope.return_type == 2)
			DoReturn(true); // assume return 0 if previously not defined or previously defined as real
		else
			Error_parse("Not all code paths return a value.");
	}
	var rtype = cur_scope.return_type;
	var rvalue = cur_scope.rvalue_all;
	
	return_delegates.delegates = Delegate.map[ cur_scope.name + "_retDel"];
	
	Delegate.return_stack.pop();
	
	
	/*Emitln("asm_sp = asm_bp;");
	Emitln("asm_bp = stack[--asm_sp];");
	
	if (params_count >0 )
		Emitln("asm_sp -= " + params_count + ";");*/
	
	scope_stack.pop();
	if(scope_stack.length == 0)
		cur_scope = undefined;
	else
		cur_scope = scope_stack[scope_stack.length-1];
		
	Emitln("}\n");
	Emitln_ast("}\n");
	
	functions_asm += compiled_asm;
	compiled_asm = compiled_js_saved;
	
	functions_js_test += compiled_js_test;
	compiled_js_test = compiled_js_test_saved;
	ast_postfix = ast_postfix_saved.slice();
	
	end_of_prog = false; 
	
	Look = old_look;
	inp = old_inp;
	inp_pos = old_inp_pos;
	
	return [ [rtype], rvalue];
}

function DoReturn(auto)
{
	if (!cur_scope)
		Error_parse('Illegal return statement.');
	
	rvalue_pos++;
	rvalue[rvalue_pos] = false;
	
	if(auto)
	{
		var rtype = 2;
		Emitln("asm_reg0_real = 0;");
		ast_postfix_push("0", 2, 0);
	}
	else
		var rtype = Expression();
		
	if (rvalue[rvalue_pos] == false)
		cur_scope.rvalue_all = false;
	

	rvalue_pos--;
	
	Delegate.Assign( rtype, Delegate.LastReturnStack(), cur_scope.name + "_retDel");
	 
	if (cur_scope.return_type != undefined && rtype != cur_scope.return_type)
		Error_parse("Deduced return type is different from previous defined type.");
		
	cur_scope.return_type = rtype;

	Emitln("asm_sp = asm_bp;\nasm_bp = stack[--asm_sp];");
	if (cur_scope.param_count_ref>0)
		Emitln("asm_sp -= " + cur_scope.param_count_ref + ";");
		
	Emitln("return; // " + types[ rtype ]);
	Emitln_ast("return "+ ast_generate_code(true) + "; //" + types[ rtype ]);
	return rtype;	
}

/////// Flow Control ////

function DoIf()
{
	Match('(');
	var type = ExpressionNew();
	
	Emitln_ast("if (" + ast_generate_code(true) + "){");
	if (type==1)
	{
		Emitln("if ( asm_reg0_real )\n{" );
	} 
	else if (type==2)
	{
		Emitln("if ( asm_reg0_real )\n{" );
	}
	else
	{
		Error_parse("Unsupported if condition");
	}
		
	Match(')');
	
	var is_return_main = Statement();
	
	if (CheckAhead('else'))
	{
		Emitln("}\nelse\n{" );
		Emitln_ast("}\nelse\n{" );
		Match('e');Match('l');Match('s');Match('e');
		
		var is_return_else = Statement();
	}
	Emitln("}");
	Emitln_ast("}");
		
	if (is_return_main && is_return_else)
		return true;
}

function get_scope()
{
	if(cur_scope)
		return cur_scope;
	else
		return global_scope;
}

function DoFor()
{	
	var ast_for_init = "", ast_for_cond = "", ast_for_next = "";
	Match('(');
	
	if(Look != ';')
	{
		ExpressionNew();
		
		ast_for_init = ast_generate_code(true);
	}
	Match(';');
	
	Emitln("while(1) {");
	
	if(Look != ';')
	{
		var type_exp = ExpressionNew();
		
		ast_for_cond = ast_generate_code(true);
	}
	Match(';');
	
	var compiled_each = "";
	
	if(Look != ')')
	{
		var compiled_js_saved = compiled_asm;
		compiled_asm = "";
		ExpressionNew();
		ast_for_next = ast_generate_code(true);
		compiled_each = compiled_asm;
		compiled_asm = compiled_js_saved;
	}
	
	if (type_exp !== undefined)
	{
		if (type_exp==1)
		{
			Emitln("if ( !asm_reg0_real )\n\tbreak;" );
		} 
		else if (type_exp==2)
		{
			Emitln("if ( !asm_reg0_real )\n\tbreak;" );
		}
		else
			Error_parse("Unsupported if condition");
	}
	var scope = get_scope();
	scope.for_while_track.push(1);
	
	Emitln_ast("for(" + ast_for_init + "; " + ast_for_cond + "; " + ast_for_next + ") {");
	
	Match(')');
	Statement();
	compiled_asm += compiled_each;
	Emitln("}\n");
	Emitln_ast("}\n");
	
	scope.for_while_track.pop();
}

function DoWhile()
{	
	Match('(');
	Emitln("while(1) {");
	var type = ExpressionNew();
	
	Emitln_ast("while (" + ast_generate_code(true) + "){");
	
	if (type==1)
	{
		Emitln("if ( !asm_reg0_real )\n\tbreak;" );
	} 
	else if (type==2)
	{
		Emitln("if ( !asm_reg0_real )\n\tbreak;" );
	}
	else
	{
		Error_parse("Unsupported if condition");
	}
	
	var scope = get_scope();
	scope.for_while_track.push(1);
	
	Match(')');
	Statement();
	Emitln("}\n");
	Emitln_ast("}\n");
	
	scope.for_while_track.pop();
}

function DoLoop(is_zero_begin)
{	
	Match('(');
	var Name = GetName();	

	var isNameDefined = comp_try_get_var_type(Name);
	// loop begin expr.
	if (!is_zero_begin)
	{
		Match(',');			
		var exp_type_begin = ExpressionNew();
		
		var begin_ast_js = ast_generate_code(true);
		
		comp_define_var(Name, exp_type_begin);
		EmitWriteVar(Name, exp_type_begin);
	}
	else
	{
		comp_define_var(Name, 2);
		Emitln("asm_reg0_real = 0;")
		EmitWriteVar(Name, 2);
		//Emitln("asm_set_var( \"" + Name + "\",0 , " + 2 + " );");	
	}
	
	var type = comp_get_var_type(Name);
	
	if (type!=2)
		Error_parse("Real type expected.");
	
	
	Emitln("while(1) {");
		
	Match(',');	
		
	//Emitln("asm_reg0_set( asm_get_var_val(\""+Name+"\")); ");
	EmitReadVar(Name, 2);
	PushLast(type);
	var exp_type_check = ExpressionNew();
	if (exp_type_check!=2)
		Error_parse("Real type expected.");
	
	PopReg1(type);
	Emitln("asm_le();");
	
	Emitln("if ( !asm_reg0_real )\n\tbreak;" );

	if (exp_type_check!=1 && exp_type_check!=2)
	{
		Error_parse("Unsupported loop expression.");
	}
		
	Emitln_ast("for(" + (isNameDefined ? "":"var ") + Name + "=" + (is_zero_begin ? "0" : begin_ast_js) + ";" + Name +"<" + ast_generate_code(true) + ";" + Name + "++) {");
	
	var scope = get_scope();
	scope.for_while_track.push(1);
	
	Match(')');
	Statement();
	
	scope.for_while_track.pop();
	
	//Emitln("asm_reg0_set( asm_get_var_val(\""+Name+"\")); ");
	EmitReadVar(Name, 2);
	PushLast(type);
	Emitln("asm_reg0_real = 1;");
	PopReg1(type);
	Emitln("asm_add_real();");
	EmitWriteVar(Name, 2);
	//Emitln("asm_set_var( \""+Name+"\", asm_reg0, 2 );");
	
	Emitln("}\n");
	Emitln_ast("}\n");
}

function DoPragma()
{
	var name = GetName();
	if(Look == ';')
		console_print(cortexParser.options[name]);
	else
	{
		var val = GetName();
		cortexParser.options[name] = val;
	}
	
	Match(';');
	
}

function EmitReadVar(name, type)
{
	var is_global = cur_scope == undefined || cur_scope.get_var_type(name) == undefined;
	
	if (type == 7)
	{
		Error_parse("void values can not be assigned.");
	}
	else if (type < 1 || type > 6)
	{
		Error_parse("Internal error. Type error 1.");
	}
	
	if ( const_vars[name] != undefined )
	{
		if(type == 1 || type == 2)
			Emitln("asm_reg0_real = " + const_vars[name] + ";" );
		else
			Emitln("asm_reg0 = " + const_vars[name] + ";" );
	}
	else if(is_global)
	{
		if(type == 1 || type == 2)
			Emitln("asm_reg0_real = heap[" + global_scope.vars_rel_pos[name] + "]; // " + name);
		else
			Emitln("asm_reg0 = heap[" + global_scope.vars_rel_pos[name] + "]; // " + name);
	}
	else
	{
		if(type == 1 || type == 2)
			Emitln("asm_reg0_stack_read_real(" + cur_scope.vars_rel_pos[name] + "); //" + name);
		else
			Emitln("asm_reg0_stack_read(" + cur_scope.vars_rel_pos[name] + "); //" + name);
	}
}

function EmitWriteVar(name, type)
{
	var is_global = cur_scope == undefined || cur_scope.get_var_type(name) == undefined;
	
	if (type == 7)
	{
		Error_parse("void values can not be set.");
	}
	else if (type<1 || type > 6)
	{
		Error_parse("Internal error. Type error 1.");
	}
	
	if ( const_vars[name] != undefined )
	{
		//Emitln("asm_reg0_set(" + const_vars[name] + ");" );
		Error_parse("Can not change const value.")
	}
	else if (is_global)
	{
		if(type == 1 || type == 2)
			Emitln("heap[" + global_scope.vars_rel_pos[name] + "] = " + "asm_reg0_real;  //" + name );
		else
			Emitln("heap[" + global_scope.vars_rel_pos[name] + "] = " + "asm_reg0;  //" + name );
	}
	else
	{
		if(type == 1 || type == 2)
			Emitln("asm_reg0_stack_write_real(" + cur_scope.vars_rel_pos[name] + "); //" + name);
		else
			Emitln("asm_reg0_stack_write(" + cur_scope.vars_rel_pos[name] + "); //" + name);
	}
}


function AssignmentOp(Name, IsIndexed, IndexMultiple)
{
	var type;
	
	Delegate.return_stack.push([]);
	
	if (IsIndexed)
	{
		type = comp_get_var_type(Name);
		if (type == 4)
		{
			//in javascript Strings are immutable so it does not work in this simple form.
			Error_parse("Strings are not supported yet.");
			/*StringIndexer(Name);
			Match('=');
			var type = Expression();
			
			Emitln("asm_string_set_elm()");*/
		}
		else
		{
			//IndexMultiple = MatrixIndexer(Name);
			Match('=');
			if (!IndexMultiple)
			{
				type = Expression();
				if (type != 2)
					Error_parse("Matrix elements should be real");
				Emitln("asm_matrix_set_elm();");
								
				ast_postfix_push(Name, 3, 0);
				ast_postfix_push('[]=', type, 4);
			}
			else
			{
				type = Expression();
				if (type != 3)
					Error_parse("Matrix expected");
					
				ast_postfix_push(Name, 3, 0);
				
				
				switch(IndexMultiple)
				{
					case 102:
						Emitln("asm_matrix_set_slice();");
						var ast = ast_postfix_push("[:]=", type, 6, "asm_matrix_set_slice()");
						ast.opts.mode = "cortex.setslice";
						break;
					case 100:
						Emitln("asm_matrix_set_slice(1); // col ");
						var ast = ast_postfix_push("[:]=", type, 5, "asm_matrix_set_slice()");
						ast.opts.mode = "cortex.setcol";
						break;
					case 101:
						Emitln("asm_matrix_set_slice(2); // row");
						var ast = ast_postfix_push("[:]=", type, 5, "asm_matrix_set_slice()");
						ast.opts.mode = "cortex.setrow";
						break;
				}
			}
		}
	}
	else
	{
		rvalue_pos++;
		rvalue[rvalue_pos] = false;
		
		Match('=');
		type = Expression();
				
		ast_postfix_push(Name, type, 0);
		var ast_eq = ast_postfix_push('=', type, 2);
		ast_eq.opts.define = (comp_try_get_var_type(Name) == undefined);
		
		if (rvalue[rvalue_pos]==false)
		{
			if (type==3)
			{
				Emitln("asm_reg0_dub_matrix();");
				ast_eq.opts.dubmat = true;
			}
			else if (type==4)
			{
				//javascript does not need copy for string but other virtual machines may need
				//Emitln("asm_reg0_dub_s();");
			}
		}
		
		
		comp_define_var(Name, type == 5 ? 6 : type);
		
		if(type == 5 || type == 6)
		{
			Delegate.Assign( type, Delegate.LastReturnStack() , Name);
			type = 6;
		}
		
		
		rvalue_pos--;
		
		EmitWriteVar(Name, type);
		
		
		
			
		//Emitln("real_stack[real_asm_sp - " + cur_scope.vars_rel_pos[Name] + "] = " + "asm_reg0_get_val();" );	
		//Emitln("real_asm_sp++");
		//Emitln("asm_set_var( \"" + Name + "\", asm_reg0_get_val(), " + type + " );");	
	}
	
	Delegate.return_stack.pop();
	
	return type;
}

function ClearUnusedParams(return_types, start, end)
{
	for (var i=start;i < end;i++)
	{
		PopReg0(return_types[i]);
	}
}

function PeekCmdFuncName()
{
	if (!IsAlpha(Look))
		return "";
		
	var cur_inpos = inp_pos;
	var cur_look = Look;
	
	var name = GetName();
	if (Look == '(')
		name = "";
	
	inp_pos = cur_inpos;
	Look = cur_look;
	
	return name;
}


// Command style function call. ( clear all, plot x y)
// no return value. all parameters are string
function CommandFuncCall(Name)
{
	Delegate.return_stack.push([]);
	var return_types = FuncCall(Name, true);
	
	Delegate.return_stack.pop();
	
	ClearUnusedParams(return_types, 1, return_types.length);
}

// [ s v d] = svd(A)
function MultiAssignment()
{
	Delegate.return_stack.push([]);
	
	Match('[');
	var Names = new Array(10);
	var num_names=0;
	while( 1)
	{
		Names[num_names] = GetName();
		num_names++;
		if (Look == ']')
		   break;
		if (Look == ',')
			Match(',');
	}
	
	Match(']');
	
	Match('=');
	
	var Name = GetName();
	
	rvalue_pos++;
	rvalue[rvalue_pos] = false;

	var return_types = FuncCall(Name);	
	
	
	if (num_names > return_types.length)
		Error_parse("Function '" +Name + "' does not have enough return values.");
	
	ClearUnusedParams(return_types, num_names, return_types.length);
	
	var type = return_types[num_names - 1];
	
	var ast = ast_postfix_push("[,,]", -1, 1);
	ast.opts.names = new Array(num_names);
	ast.opts.define = new Array(num_names);
	for (var i=0;i < num_names ;i++)
	{
		ast.opts.define[i] = comp_try_get_var_type(Names[i]) == undefined;
		ast.opts.names[i] = Names[i];
	}
	
	comp_define_var(Names[num_names - 1], type);
	if (type==3 && rvalue[rvalue_pos] == false)
	{
		Emitln("asm_reg0_dub_matrix();");
		ast.opts.dubmat = true;
	}
	
	rvalue_pos--;
	
	EmitWriteVar(Names[num_names - 1], type);

	for (var i=num_names - 2;i >=0 ;i--)
	{
		PopReg0(return_types[i]);
	
		comp_define_var(Names[i], return_types[i]);
		
		if (return_types[i]==3 /*&& assignment_copy_needed*/)
		{
			Emitln("asm_reg0_dub_matrix();");
		}
		
		EmitWriteVar(Names[i], type);
		//Emitln("asm_set_var( \"" + Names[i] + "\", asm_reg0, " + return_types[i] + " );");
	}
	
	
	
	Delegate.return_stack.pop();
	
	return type;
}

function StatementBlock()
{
	var all_paths_return = false;
	Match('{');
	while(Look!='}')
	{
		if ( Statement())
			all_paths_return = true;
	}
	Match('}');
	return all_paths_return;
}

function Statement()
{
	var all_paths_return = false;
	if (Look == ';')
	{
		Match(';'); // empty statement
	}
	else if (Look == '[')
	{
		var type = MultiAssignment();
		Emitln_ast( ast_generate_code(true) + ";");
		return type;
	}
	else if (Look == '{')
	{
		if (StatementBlock())
			all_paths_return = true;
	}
	else if (CheckAhead("while"))
	{
		GetName();
		DoWhile();
	}
	else if (CheckAhead("for"))
	{
		GetName();
		DoFor();
	}
	else if (CheckAhead("loop0"))
	{
		GetName();
		DoLoop(true);
	}
	else if (CheckAhead("loop"))
	{
		GetName();
		DoLoop(false);
	}
	else if (CheckAhead("pragma"))
	{
		GetName();
		DoPragma();
	}
	else if (CheckAhead("break"))
	{
		GetName();
		var scope = get_scope();
		if(scope.for_while_track.length == 0)
			Error_parse("illegal break.");
			
		Emitln("break;");
	}
	/*else if (CheckAhead("continue"))
	{
		GetName();
		var scope = get_scope();
		if(scope.for_while_track.length == 0)
			Error_parse("continue should be in for or while.");
		
		Emitln("continue;");
	}*/
	else if (CheckAhead("if"))
	{
		GetName();
		if( DoIf() )
			all_paths_return = true;
	}
	else if (CheckAhead("return"))
	{
		GetName();
		DoReturn(false);
		all_paths_return = true;
		Match(';');
	}
	else 
	{
		var cmd_style_name = PeekCmdFuncName();
			
		if (FindFunctionWithName(cmd_style_name) != -1)
		{
			CommandFuncCall(GetName());
			Emitln_ast( ast_generate_code() + ";");
		}
		else
		{
			var op_len = ast_postfix.length;
			ExpressionNew();
			if(ast_postfix.length>op_len)
			{
				Emitln_ast( ast_generate_code() + ";");
			}
		}
			
		Match(';');

		
	}			
	
	return all_paths_return;
}


function Preload()
{
	asm_async_preload = false;
	
	if(CheckAhead("preload"))
	{
		GetName();
		Match('{');
		
		while ( Look != "}") 
		{
			asm_async_preload = true;
			Match('"');
			Preloader.image_src.push( GetString() );
			Match('"');
			
			if (CheckAhead("as"))
			{
				GetName();
				Match('"');
				Preloader.image_alias.push( GetString() );
				Match('"');
			}
			else
			{
				Preloader.image_alias.push( "__" );
			}
			
			if (Look == "}")
				break;
				
			Match(",");
		}
		//Block();
		Match('}');
	}
}

var modules = {};

function ImportAsyncLoad(code_inp)
{
	end_of_prog = false;
	inp = code_inp;
	inp_pos = 0;
	GetChar();
	SkipWhite();
	
	var files = [];
	
	while (CheckAhead("import"))
	{
		GetName();
		Match('"');
		var src = GetString();
		Match('"');
		
		files.push(src);
	}
	
	for(var i = 0; i < files.length; i++)
		files[i].loaded = false;
	
	var count = 0;
	var data_loaded = {};
	for(var i = 0; i < files.length; i++)
	{
		var file_url = "compiler/lib/" + files[i] + ".crx";
		var request = $.get(file_url, '', 'text');
		
		request.done(function(data){
			count++;
			data_loaded[this.url] = data;
			if(count == files.length)
			{
				for(var i = 0; i < files.length; i++)
				{
					console_print(" --- " + files[i] + ' --- \r\n' + data_loaded[file_url] + '\r\n');
					ImportAsyncLoad(data_loaded[file_url]);
				}
					
				/*cortexParser.compile_aux(code_inp);*/
				console_print("import load done");
			}
		});
		
		request.fail(function(data){
			alert(data);
		});
	/*
		var count = 0;
		$.get(files[i], '', 'text')
		.done(function(data){
			
			alert(i);
			count++;
			if(count == files.length)
			{
				/*for(var i = 0; i < files.length; i++)
					ImportAsyncLoad(data);* /
			}
		})
		.fail(function(data){
			alert(data);
		});*/
		
	}
	
	//cortexParser.compile_aux(code_inp);
}

function Import()
{
	while(CheckAhead("import"))
	{
		GetName();
		Match('"');
		GetString();
		Match('"');
	}
}

function Program()
{
	Import();
	Preload();
	
	while(!end_of_prog)
	{
		if (CheckAhead("function") || CheckAhead("real") || CheckAhead("matrix") || CheckAhead("string") || CheckAhead("bool"))
		{
			DoFunction();
		}
		else if (CheckAhead("clear"))
		{
			GetName();
			var var_name = GetName();
			if(var_name=="all")
				comp_clear_all();
			else
			{
				comp_clear_var(var_name);
			}
		}
		else
		{
			Statement();
		}
	//Block();
	
	/*if (!end_of_prog)
	{
		Error_parse("Unexpected '}'.");
	}*/
	
	}
	
	if (__ans_pos >= 0)
		compiled_js_test = compiled_js_test.slice(0, __ans_pos) + "__ans = " + compiled_js_test.slice(__ans_pos);
	
	if (comp_type_is_real(last_expression_type))
		compiled_asm += "\n__ans = asm_reg0_real;"
	else
		compiled_asm += "\n__ans = asm_reg0;"
	
	LinkDelegateFunctions();
}

// workaround function for js not allowing calls to functions in evaled code.
function ftable_function(ast)
{	
	var t_s = "";
	
	for (var type in Delegate.ftable_funcs)
	{	
		if (!Delegate.ftable_funcs.hasOwnProperty(type))
		    continue;
		var type_suffix = type.split("$")[0];
		var s = "\nfunction asm_fjump_table_"+ func_gen_names[ type ] + "(fname){\n  switch(fname)\n  {\n";
		
		var i = 0;
		for (var n in Delegate.ftable_funcs[type])
		{
			s += "  case " + Delegate.ftable_funcs[type][n] + " : " + (ast ? "return " : "") + "asm_func_" + func_gen_names[n + type_suffix] + (ast ? "" : "()") + "; break;\n";
			i++;
		}
		
		s += "  default: cortex.error_run('Internal error');  \n}\n}";
		
		if (i != 0)
			t_s += s;
			
	}
	
	return t_s;
}




function FunctionDefs(name, args, retvals, body, assignment_copy_needed, ast_body)
{
	this.name = name;
	this.args = args;
	this.retvals = retvals;
	this.body = body;
	this.assignment_copy_needed = assignment_copy_needed;
	this.ast_body = ast_body;
}


var function_list = new Array( 
new FunctionDefs("error", [ 4 ], [4], "	cortex.error_run(param0);" , false),
//new FunctionDefs("exit", [ 2 ], [2], "	cortex.error_run(param0);" , false),
new FunctionDefs("sum", [ 3 ], [2 ], "	asm_reg0_real = numeric.sum(param0);" , false),
new FunctionDefs("det", [ 3 ], [2 ], "	asm_reg0_real = numeric.det(param0);" , false),
new FunctionDefs("inv", [ 3 ], [3 ], "	try { asm_reg0 = numeric.inv(param0);} catch(err){ cortex.error_run('Non invertible matrix'); }" , false),
new FunctionDefs("trans", [ 3 ], [3 ], "	asm_reg0 = numeric.transpose(param0);" , false),
new FunctionDefs("diag", [ 3 ], [3 ], "	asm_reg0 = numeric.diag(param0[0]);" , false),
new FunctionDefs("ones", [ 2 ], [3 ], "	asm_reg0 = numeric.rep([param0,param0],1);" , false),
new FunctionDefs("ones", [ 2,2 ], [3 ], "	asm_reg0 = numeric.rep([param0,param1],1);" , false),
new FunctionDefs("zeros", [ 2 ], [3 ], "	asm_reg0 = numeric.rep([param0,param0],0);" , false),
new FunctionDefs("zeros", [ 2,2 ], [3 ], "	asm_reg0 = numeric.rep([param0,param1],0);" , false),
new FunctionDefs("rand", [ 2 ], [3 ], "	asm_reg0 = numeric.random([param0,param0]);" , false),
new FunctionDefs("rand", [ 2,2 ], [3 ], "	asm_reg0 = numeric.random([param0,param1]);" , false),
new FunctionDefs("randn", [  ], [2 ], "	asm_reg0_real = cortex.randn();" , false),
new FunctionDefs("randn", [ 2,2 ], [3 ], "	asm_reg0 = cortex.createinit(param0, param1, cortex.randn);" , false),
new FunctionDefs("randn", [ 2], [3 ], "	asm_reg0 = cortex.createinit(param0, param0, cortex.randn);" , false),
new FunctionDefs("eye", [ 2 ], [3 ], "	asm_reg0 = numeric.identity([param0]);" , false),
new FunctionDefs("linspace", [ 2,2,2 ], [3 ], "	asm_reg0 = [numeric.linspace(param0, param1, param2)];" , false),
new FunctionDefs("linspace", [ 2,2 ], [3 ], "	asm_reg0 = [numeric.linspace(param0, param1, 100)];" , false),
new FunctionDefs("svd", [3 ], [ 3,3,3 ], 
'\	var r = numeric.svd(param0); \
\n\	asm_reg0 = r.U ; \
\n\	stack[asm_sp++] = asm_reg0; \
\n\	asm_reg0 = [r.S]; \
\n\	stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = r.V;' , false, 
'	var r = numeric.svd(param0);\n	return [r.U, [r.S], r.V];'
),		
new FunctionDefs("linsolve", [3,3], [ 3 ], 
"\	if(param0.length != param0[0].length) cortex.error_run('matrix must be square.');\
\n\	if(param0[0].length != param1.length) cortex.error_run('matrix size mismatch.');\
\n\	asm_reg0 =  asm_util_array_to_column_matrix(numeric.solve(param0, asm_util_column_matrix_to_array(param1), false));" , false),
new FunctionDefs("lu", [3], [ 3,3 ], 
"\	if(param0.length != param0[0].length) cortex.error_run('matrix must be square.');\
\	var r = numeric.LU(param0); \
\n\	asm_reg0 = r.LU ; \
\n\	stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = [r.P];" , false,
'	var r = numeric.LU(param0);\n	return [r.LU, [r.P]];'
),
new FunctionDefs("cholesky", [3], [ 3 ], 
"\	if(param0.length != param0[0].length) cortex.error_run('matrix must be square.');\
\	var r = cortex.cholesky(param0); \
\n\	asm_reg0 = r; " , false),
new FunctionDefs("eig", [3], [ 3,3,3,3 ], 
"\	var r = cortex.eig(param0); \
\n\	asm_reg0 = r[0]; \
\n\	stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = r[1];\
\n\	stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = r[2];\
\n\	stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = r[3];" 
, false,
'	var r = cortex.eig(param0);\n	return r;'
),
new FunctionDefs("close", [ 2 ], [ 2 ], "	asm_reg0_real = closeFigures(param0);\n	" , false),
new FunctionDefs("close", [ 4 ], [ 2 ], "	asm_reg0_real = closeFigures(param0);\n	" , false),

new FunctionDefs("plot", [3 ], [ 2 ], "	asm_reg0_real = plotArray(param0, undefined, '');\n	" , false),
new FunctionDefs("plot", [3,3], [ 2 ], "	asm_reg0_real = plotArray(param0, param1, '');\n	" , false),
new FunctionDefs("plot", [3,4 ], [ 2 ], "	asm_reg0_real = plotArray(param0, undefined, param1);\n	" , false),
new FunctionDefs("plot", [3,3,4], [ 2 ], "	asm_reg0_real = plotArray(param0, param1, param2);\n	" , false),
new FunctionDefs("plot", [3,3 ], [ 2 ], "	asm_reg0_real = plotArray(param0, undefined, '', param1, undefined, '');\n	" , false),
new FunctionDefs("plot", [3,3,3,3], [ 2 ], "	asm_reg0_real = plotArray(param0, param1, '', param2, param3, '');\n	" , false),
new FunctionDefs("plot", [3,4, 3,4 ], [ 2 ], "	asm_reg0_real = plotArray(param0, undefined, param1, param2, undefined, param3);\n	" , false),
new FunctionDefs("plot", [3,3,3,3,4], [ 2 ], "	asm_reg0_real = plotArray(param0, param1, undefined, param2, param3, param4);\n	" , false),
new FunctionDefs("plot", [3,3,4,3,3], [ 2 ], "	asm_reg0_real = plotArray(param0, param1, param2, param3, param4, undefined);\n	" , false),
new FunctionDefs("plot", [3,3,4,3,3,4], [ 2 ], "	asm_reg0_real = plotArray(param0, param1, param2, param3, param4, param5);\n	" , false),

new FunctionDefs("imshow", [3 ], [ 2 ], "	asm_reg0_real = showImage(param0);\n	" , false),
new FunctionDefs("imshow", [3,3,3 ], [ 2 ], "	asm_reg0_real = showImage(param0,param1,param2);\n	" , false),
new FunctionDefs("imread", [ 4 ], [ 3,3,3 ], 
'\	var r = imageRead(param0); \
\n\	asm_reg0 = r.R ; \
\n\	stack[asm_sp++] = asm_reg0; \
\n\	asm_reg0 = r.G; \
\n\	stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = r.B;' , false,
'	var r = imageRead(param0);\n	return [r.R, r.G, r.B];'
),
new FunctionDefs("im2bw", [ 3,2 ], [3 ], 
"\	param0 = numeric.clone(param0); \
\n\	asm_util_matrix_map(param0, function(x){ return x < param1 ? 0: 255 } ); \
\n\	asm_reg0 = param0;" , false),
new FunctionDefs("numcols", [3], [ 2 ], 
"\	asm_reg0_real = param0[0].length;" , false),
new FunctionDefs("numrows", [3], [ 2 ], 
"\	asm_reg0_real = param0.length;" , false),
new FunctionDefs("tic", [ ], [ 7 ], 
"\	cortex.ticTime = new Date();asm_reg0 = undefined" , false),
new FunctionDefs("toc", [ ], [ 2 ], 
"\	asm_reg0_real = (new Date())- cortex.ticTime;" , false),
new FunctionDefs("clc", [ ], [7 ], "	document.getElementById('output_win_txt').innerHTML = ''\n	asm_reg0 = undefined;" , false),
new FunctionDefs("animstop", [ 2 ], [ 7 ], "	clearInterval(openFigures[param0].timerID);\n	console_print('Anim is stopped');" , false),
new FunctionDefs("animdraw", [ 2, 3 ], [ 7 ], "	updateImage(param0, param1);" , false),
new FunctionDefs("animdraw", [ 2, 3, 3, 3 ], [ 7 ], "	updateImage(param0, param1, param2, param3);" , false),
new FunctionDefs("_dotests", [  ], [ 2 ], "	asm_reg0_real = do_tests();" , false),
new FunctionDefs("_heap", [  ], [ 7 ], "	console_print(heap);" , false),
new FunctionDefs("_stack", [  ], [ 7 ], "	console_print(stack);" , false),
new FunctionDefs("_bench", [ 2 ], [ 7 ], "	asm_reag0_real = benchmark1(param0);" , false),
new FunctionDefs("_alert", [ 4 ], [ 7 ], "	alert(param0);\n	asm_reg0 = undefined;" , false),
//new FunctionDefs("_js", [ 4 ], [ 4 ], "	asm_reg0 = eval(param0);" , false),
new FunctionDefs("_compile", [  ], [ 2 ], "	if(compile( ace_editor.getSession().getValue() )) console_print('Success.');update_editor();" , false),

new FunctionDefs("abs", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("acos", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("asin", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("atan", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("atan2", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("ceil", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("cos", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("exp", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("floor", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("log", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("max", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("min", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("pow", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("random", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("round", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("sin", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("sqrt", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("tan", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("anim", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("print", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("disp", [  ], [  ], "	throw 'Internal error'" , false)
);

cortexParser.functionList = function_list;
var function_list_lib_size = function_list.length;

function FindFunctionWithName(name)
{
	for (var i=0; i< function_list.length; i++)
	{
		if(name == function_list[i].name)
			return i;
	}
	
	return -1;
}

function FindFunctionIndex(name, args)
{
	for (var i=0; i< function_list.length; i++)
	{
		if(args.length == function_list[i].args.length && name == function_list[i].name ) 
		{
			var r = true;
			
			for(var arg_i=0;arg_i< args.length; arg_i++)
			{
				if (args[arg_i]!==function_list[i].args[arg_i])
				{
					r = false;
					break;
				}
			}
			
			if (r)
				return i;
		}
	}
	
	return -1;
}

function ErrorInvalidFunctionParam(name, args)
{
	var name_match_ind;
		
	var best_match_ind = -1, best_match_count = -1, is_name_match = false;
	
	for (var name_match_ind=0; name_match_ind< function_list.length; name_match_ind++)
	{
		if ( name == function_list[name_match_ind].name)
		{
			is_name_match = true;
			
			if( function_list[name_match_ind].args.length === args.length )
			{
				var c = 0;
				
				for(i = 0; i < function_list[name_match_ind].args.length; i++)
				{
					if (args[i]===function_list[name_match_ind].args[i])
						c++;
				}
				
				if (c > best_match_count)
				{
					best_match_count = c;
					best_match_ind = name_match_ind;
				}			
			}
		}
	}
	
	if( best_match_ind !=-1 )
	{
		for(var i=0;i< function_list[best_match_ind].args.length; i++)
			if (args[i]!==function_list[best_match_ind].args[i])
				Error_parse('Invalid parameter : "' + name + '" ' + (i+1) + '. parameter.' );
	}
	else
	{
		if (is_name_match)
			Error_parse("Invalid parameter count : '" + name + "'.");
		else
			Error_parse("Undefined function : '" + name + "'.");
	}
	
	Error_parse('Unexpected Assertion.');
}



function StandartFunctions(Name, func_name, params_count, params_type, params_delegate)
{
	var return_types;
	var inline_functions = "";
	EmitFuncln( 'function asm_func_' + func_name + '()');
	EmitFuncln( '{');
		
	var param_str = "";
	for (var i = params_count-1; i>=0; i--)
	{
		EmitFuncln( '	var param' + i + ';');
		
		
		if(params_type[i] == 1 || params_type[i] == 2)
		{
			EmitFuncln( '	asm_pop_real();');
			EmitFuncln( '	param' + i + ' = asm_reg0_real;');
		}
		else
		{
			EmitFuncln( '	asm_pop();');
			EmitFuncln( '	param' + i + ' = asm_reg0;');
		}
		EmitFuncln('');
		
		if ( i==params_count-1)
			param_str = ' param' + i + param_str;
		else
			param_str = ' param' + i + ',' + param_str;
	}
	
	if(Name != 'anim')	
		EmitFuncln_ast( 'function asm_func_' + func_name + '(' + param_str + ') {');
	
	var ismath = Name.lastIndexOf(".") == -1 &&  eval('Math.' + Name);	
	if(ismath) 
	{	
		if ( params_type[0] == 3)
		{
			//assignment_copy_needed = false
			return_types = [3];
			EmitFuncln( '	param0 = numeric.clone(param0);');
			EmitFuncln( '	asm_util_matrix_map(param0, Math.' + Name + ');');
			EmitFuncln( '	asm_reg0 = param0;');	
			
			EmitFuncln_ast( '	param0 = numeric.clone(param0);');
			EmitFuncln_ast( '	asm_util_matrix_map(param0, Math.' + Name + ');');
			EmitFuncln_ast( '	return param0;');
			
		}
		else 
		{
			return_types = [2];
			EmitFuncln( '	asm_reg0_real = Math.' + Name + '(' + param_str + ');');
			EmitFuncln_ast( '	return Math.' + Name + '(' + param_str + ');');
		}
	}	
	else if ( Name =='anim')
	{
		return_types = [2];
		
		if ( params_count > 2)
			Error_parse('anim : Invalid parameter count.');
			
		var interval;
		if (params_count == 1)
			interval = "33";
		else
		{
			if(params_type[1] != 2)
				Error_parse("Real type expected for second parameter.");
			interval = "param1";
		}
		
		if(params_type[0] == 5 || params_type[0] == 6)
		{
			var return_delegates = {};
			
			var hold_function_js = functions_asm;
			functions_asm = "";
			Delegate.Assign(params_type[0], params_delegate[0], "_anim_tempval" + anim_count);
			var return_types_callback = LinkDelegation("_anim_tempval" + anim_count, 1, [2], return_delegates, [[],[],[]]);
			anim_count++;
			inline_functions = functions_asm;
			functions_asm = hold_function_js;
			
			EmitFuncln_ast( 'function asm_func_' + func_name + '(' + param_str + ') {');
			
			EmitFuncln("");
			
			var suffix = "2_" + return_types_callback[0];
			EmitFuncln("	var id = showImage(numeric.rep([100,100],0));\n	openFigures[id].timerID = setInterval( function(){ try { asm_reg0_real = id;asm_push();\n		asm_fjump_table_" + suffix + "(param0);//asm_call_reg0();\n		if (openFigures[id] == undefined || openFigures[id].closed)	{\n			clearInterval(openFigures[id].timerID);		console_print('Animation is stopped');update_editor(); } } catch(err) { for(var i = 0 ; i < openFigures.length ; i++)	clearInterval(openFigures[i].timerID); console_print_run_error(err.message); }		}, " + interval + ");");			
			EmitFuncln("	console_print('Animation is started');\n	asm_reg0_real = id;");
			
			EmitFuncln_ast("	var id = showImage(numeric.rep([100,100],0));\n	openFigures[id].timerID = setInterval( function(){ try { \n		asm_fjump_table_" + suffix + "(param0)(id);\n		if (openFigures[id] == undefined || openFigures[id].closed)	{\n			clearInterval(openFigures[id].timerID);		console_print('Animation is stopped');update_editor(); } } catch(err) { for(var i = 0 ; i < openFigures.length ; i++)	clearInterval(openFigures[i].timerID); console_print_run_error(err.message); }		}, " + interval + ");");			
			EmitFuncln_ast("	console_print('Animation is started');\n	return id;");
		}
		else
		{
			Error_parse("Function expected for first parameter.")
		}
	}
	else if ( Name =='disp' || Name == 'print')
	{
		var style = document.getElementById('format_style').selectedIndex;
		var format = document.getElementById('pres_check').checked;
	
		if ( params_count > 1)
			Error_parse('disp : Invalid parameter count.');
		
		EmitFuncln(DispBody(params_type[0], style, format));
		
		EmitFuncln_ast( DispBody(params_type[0], style, format));
				
		return_types = [7];
	}
	else
	{
		var ind = FindFunctionIndex(Name, params_type);
		
		if (ind==-1) 
			ErrorInvalidFunctionParam(Name, params_type);
		//type = function_list[ind].retvals[0];
		
		//for(var i=0;i< function_list[ind].retvals.length;i++)
			//return_types[i] = function_list[ind].retvals[i];
		return_types = function_list[ind].retvals;
			
		EmitFuncln( function_list[ind].body);
		
		if( function_list[ind].ast_body)
			EmitFuncln_ast( function_list[ind].ast_body);
		else
		{
			EmitFuncln_ast( function_list[ind].body);
		
			if (comp_type_is_real(return_types[0]))
				EmitFuncln_ast( "	return asm_reg0_real;");
			else
				EmitFuncln_ast( "	return asm_reg0;");
		}
		
	}
	
	EmitFuncln( '}');
	EmitFuncln('');	
	
	EmitFuncln_ast( '}');
	EmitFuncln_ast('');	
	
	functions_asm += inline_functions;
	functions_js_test += inline_functions;
	
	return return_types;
}

function LinkFunc(Name, params_count, params_type, return_delegates, params_delegate)
{		
	var return_types;	

	var func_name = GetLinkFunctionName(Name, params_type, params_count);
	
	if(linked_functions[func_name] == undefined)
	{
		linked_functions[func_name] = { return_types : [2] };
		for (var i=0;i < function_list.length; i++)
			if (function_list[i].name == Name) 
				{
					linked_functions[func_name] = { return_types : [function_list[i].retvals[0]]} ;
					break;
				}
		
		if (user_func_codes[Name] != undefined)
		{
			var report_pos_old = report_pos;
			report_pos = user_func_codes_pos[Name];
			
			var link_result = DoFunctionLink(func_name, user_func_codes[Name], params_count, params_type, return_delegates, params_delegate);
			return_types = link_result[0];
			report_pos = report_pos_old;
			
			rvalue[rvalue_pos] = link_result[1];
		}
		else
		{
			return_types = StandartFunctions(Name, func_name, params_count, params_type, params_delegate);
			rvalue[rvalue_pos] = true;
		}
		
		linked_functions[func_name] = {return_types :return_types, delegates : return_delegates.delegates};
	}
	else
	{
		return_types = linked_functions[func_name].return_types; 
		
		if( user_func_codes[Name] == undefined)
			rvalue[rvalue_pos] = true;
	}
	
	
	return return_types;
}


function DispBody(type, style, format)
{
	var fbody = "";
	if (type ==3)
		fbody +='	console_print( asm_matrix_print( param0, ' + format + ' , ' + style + ') );\n';
	else if	(type ==2)
		fbody +='	console_print( asm_format_number( param0, ' + format + ' , ' + style + ') );\n';
	else if (type == 7)
	{
		//void
	}
	else if (type == 4)
	{
		fbody +='	console_print( param0 );\n';
	}
	else if (type == 5 || type == 6)
	{
		fbody +='	console_print( "function : " + param0 );\n';
	}
	else
	{
		fbody +='	console_print( param0 );\n';
	}
	
	fbody +='	asm_reg0 = undefined;\n';
	
	return fbody;
}






function comp_define_var_const(varname, value, type)
{
	const_vars[varname] = value;
	const_vars_type[varname] = type;
}

function comp_define_var(varname, type)
{
	if (cur_scope && global_scope.get_var_type(varname) === undefined )
	{
		cur_scope.define_var(varname, type);	
	}
	else 
	{
		global_scope.define_var(varname, type);
	}
}

function comp_try_get_var_type(varname)
{
	var r = undefined;
	
	if (cur_scope)
		r = cur_scope.get_var_type(varname);
		
	if (r!=undefined)	
		return r;
	
	//r = vars_type[varname];
	r = global_scope.get_var_type(varname);
	
	if (r===undefined)
	{
		r = const_vars_type[varname];
	}
		
	return r;
}

function comp_get_var_type(varname)
{
	var r = comp_try_get_var_type(varname);
	if (r===undefined)
	{
		Error_parse("Undefined variable : '" + varname + "'.");
		
		return 0;
	}
	
	return r;
}


function comp_clear_all()
{
	global_scope.clear_all();
	
	const_vars=[];
	const_vars_type=[];
	
	define_language_consts();
	
	heap = new Array(1000); 
	stack = new Array(1000);
}

function define_language_consts()
{
	const_vars=[];
	const_vars_type=[];
	
	comp_define_var_const('true',  1, 1);
	comp_define_var_const('false', 0, 1);
	comp_define_var_const('pi', Math.PI, 2);
	
	for(var i = 0; i < function_list_lib_size; i++)
		comp_define_var_const(function_list[i].name, i, 5);
}

function comp_type_is_real(type)
{
	return type == 1 || type == 2;
}

function comp_clear_var(name)
{
	global_scope.clear_var(name);
}

function import_global_scope()
{
	var code = "";
	for (var v in global_scope.vars)
	{
		if (!global_scope.vars.hasOwnProperty(v))
			continue;
		var type = global_scope.get_var_type(v);

		code += "var " + v + " = heap["+ global_scope.vars_rel_pos[v] + "];\n";
	}
	
	return code + "\n";
}

function export_global_scope()
{
	var code = "";
	

	for (var v in global_scope.vars)
	{
		if (!global_scope.vars.hasOwnProperty(v))
			continue;
		var type = global_scope.get_var_type(v);

		code += "heap["+ global_scope.vars_rel_pos[v] + "] = " + v + ";\n";
	}
	
	return code + "\n";
}



function Init(code_exe)
{
	linked_functions = [];
	inp = code_exe;
	inp_pos = 0;
	end_of_prog = false;	
	//console_js = document.getElementById('output_win_txt').value ;
	compiled_asm = "";
	functions_asm = "";
	
	compiled_js_test = import_global_scope();
	
	functions_js_test = "";
	ast_postfix = new Array();
    ast_root = new Array();
	__ans_pos = -1;
	
	global_scope.vars_deduced = [];
	Delegate.ftable_funcs = [];
	Delegate.map = [];
	Delegate.return_stack = [];
	Delegate.to_be_linked = [];
	
	rvalue_pos = 0;
	user_func_codes = new Array();
	user_func_codes_pos = new Array();
	report_pos = 0;
	function_list.length = function_list_lib_size;
	
	func_uid = 0;
	func_gen_names = [];
	
	cur_scope = undefined;
	scope_stack = new Array();
	
	Preloader.image_src = new Array();
	Preloader.image_alias = new Array();
	Preloader.import_src = new Array();
	
	modules = {};
	
	define_language_consts();
	
	GetChar();
	SkipWhite();
}




}( window.cortexParser = window.cortexParser || {} ));
