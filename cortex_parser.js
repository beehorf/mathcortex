/*
Compiler for MathCortex language

Copyright (c) 2012-2016 Gorkem Gencay. 

MathCortex Compiler is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

MathCortex Compiler is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with MathCortex Compiler. If not, see <http://www.gnu.org/licenses/>.
*/

"use strict";

(function( cortexParser, undefined ) {

cortexParser.compile = function(code_inp)
{
	return cortexParser.compile_aux(code_inp);
}

cortexParser.compile_aux = function(code_inp)
{
	try
	{
		Init(code_inp);
		
		Program();
		compiled_js +=  "\n" + export_global_scope() + '\n/// Functions ///\n\n' + functions_js + ftable_function(true);
		compiled_c +=  "\n" + export_global_scope() + '\n/// Functions ///\n\n' + functions_c + ftable_function(true);		
	}
	catch(err)
	{
		compiled_c = "";
		compiled_js = "";
		
		if(cortexParser.printError)
			cortexParser.printError(err.message);
		else
			throw(err);
		
		return false;
	}
	
	return true;
};

cortexParser.printError = function(s){ console.log(s)};
cortexParser.print = function(s){ console.log(s)};

cortexParser.options = { "execute": "JS" };

// Return last character position parsing. Used for error position
cortexParser.getInpPos = function()
{
	return inp_pos + report_pos - 1;
};


cortexParser.getCompiledCode = function()
{
	if(cortexParser.options["execute"] == "JS")
		return {"code" : cortexParser.getCompiledJS(), "resources" : PreloadList, "symbols" : global_scope.vars_rel_pos};
	else if(cortexParser.options["execute"] == "C")
		return {"code" : cortexParser.getCompiledC(), "resources" : PreloadList, "symbols" : global_scope.vars_rel_pos};
	
	return {"code":"", "resources" : null};
};

cortexParser.getCompiledJS = function()
{
	return compiled_js;
}

cortexParser.getCompiledC = function()
{
	return compiled_c;
}


cortexParser.getGlobalScope = function()
{
	return global_scope;
};

cortexParser.getSymbols = function()
{
	return global_scope.vars_rel_pos;
};

cortexParser.defineVar = function(varname, type)
{
	comp_define_var(varname, type);
};

cortexParser.isLastExpressionReal = function()
{
	return comp_type_is_real(last_expression_type);
};


cortexParser.clearAll = comp_clear_all;
cortexParser.clearVar = comp_clear_var;
cortexParser.functionList = [];

var type_names = [ "reserved", 
			  "bool" /* 1 */, 
			  "real" /* 2 */, 
			  "matrix" /* 3 */, 
			  "string", /* 4 */
			  "function" /* 5 */ , 
			  "functionptr" /* 6 */,  
			  "void" /* 7 */ ,
			  "method" /* 8 */,
			  "module" /* 9 */];
			  
cortexParser.type_names = type_names;

var Look;

var inp;
var inp_pos;
	
var end_of_prog = false;
var cur_indent = 0;

var compiled_js = "";
var functions_js = "";

var compiled_c = "";
var functions_c = "";

//////////////
var cur_scope; 

var scope_stack = new Array();
var user_func_codes = new Array();
var report_pos = 0; // used for error reporting only
var current_module_name = ""; // used for error reporting only
cortexParser.current_module_name_link = ""; // used for error reporting only
cortexParser.current_function_name = ""; // used for error reporting only

var cur_module;
//var module_stack = new Array();

var global_scope = new VariableScope(true);

var const_vars=[];
var const_vars_type=[];

var last_expression_type;
var __ans_pos;

var rvalue = new Array(); // close to move constructor concept
var rvalue_pos = 0;

var keywords = ["bool", "real", "matrix", "string", "function", "functionptr", "void", "else", "if", "clear", 
				"function", "while", "loop0", "loop", "switch", "for", "do", "const", "enum", "class", "struct", "break", 
				"continue", "default", "pragma", "preload", "import", "namespace", "as", "return", "var", "global", "module"];



var linked_functions = [];

var ast_root = new Array();
var ast_postfix = new Array();

var anim_count = 0;
var func_uid;
var func_gen_names;
var anonymous_uid;

var ObjectList = new Array( 
);

var PreloadList = {};

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
		if(infinite>500000) 
			Error_parse("Internal error: infinite ast_from_postfix");
	}
	
	return ast_postfix.shift();
	
}


function ast_generate_js(ast_node)
{	
	var op_func_map = { '+' : 'numeric.add' , '*' : 'numeric.mul' , '/' : 'numeric.div', '-' : 'numeric.sub', '==' : 'cortex.matrixsame', '!=' : '!cortex.matrixsame', '<=' : 'leq', '>=' : 'geq', '<' : 'le', '>' : 'ge', 
					'.*' : 'cortex.elm_mul', './' : 'cortex.elm_div', '%' : 'numeric.mod'};
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
		/*if( cortexParser.isObject(ast_node.nodes[0].type) && !ast_node.nodes[0].opts.ctor ) 
			Error_parse("Can not assign to objects");*/
		if (ast_node.opts.dubmat == true)
			js_code = ast_generate_js(ast_node.nodes[1]) + ' ' + ast_node.op + " numeric.clone(" + ast_generate_js(ast_node.nodes[0]) + ')';
		else
			js_code = ast_generate_js(ast_node.nodes[1]) + ' ' + ast_node.op + ' ' + ast_generate_js(ast_node.nodes[0]);
	}	
	else if(ast_node.op == '[,,]') //multiassign
	{
		ast_node.nodes[0].opts.multireturn = false; // we override this, because we will handle
		js_code = 'var __temp = ' + ast_generate_js(ast_node.nodes[0]) + ';\n';
		for(var i=0;i< ast_node.opts.names.length; i++)
		{
			if (ast_node.opts.dubmat)
				js_code += ast_node.opts.names[i] + ' = numeric.clone(__temp[' + i + ']' + (i!=ast_node.opts.names.length-1 ? ');\n' : ')');
			else
				js_code += ast_node.opts.names[i] + ' = __temp[' + i + ']' + (i!=ast_node.opts.names.length-1 ? ';\n' : '');
		}
	}
	else if (ast_node.op == ":")
	{
		if(ast_node.nodes.length == 2)
			js_code = "cortex.createrange(" + ast_generate_js(ast_node.nodes[1]) + ", " + ast_generate_js(ast_node.nodes[0]) + ", 1)" ;
		else
			js_code = "cortex.createrange(" + ast_generate_js(ast_node.nodes[2]) + ", " + ast_generate_js(ast_node.nodes[0]) + ", " + ast_generate_js(ast_node.nodes[1]) + ")";
	}	
	else if (ast_node.op == ".")
	{
		js_code = ast_generate_js(ast_node.nodes[1]) + "[" + ast_generate_js(ast_node.nodes[0]) + "]" ;
	}
	else if (ast_node.op == "$c")
	{
		js_code =  '[';
		for(var i=ast_node.nodes.length-2; i>=0; i--)
		{
			js_code += ast_generate_js(ast_node.nodes[i]) + ((i!=0) ? ', ' : '');
		}
		js_code += ']';
	}
	else if (ast_node.op == "+=" || ast_node.op == "-=")
	{
		if(ast_node.type == 2 || ast_node.type == 4)
			js_code = ast_generate_js(ast_node.nodes[1]) + ast_node.op + ast_generate_js(ast_node.nodes[0]);
		else if (ast_node.type == 3)
		{
			var op_func = ast_node.op == "+=" ? "numeric.addeq(" : "numeric.subeq(";
			js_code = op_func + ast_generate_js(ast_node.nodes[1]) + ', ' + ast_generate_js(ast_node.nodes[0]) + ")";
		}
	}
	else if (ast_node.op == "*=" || ast_node.op == "/=")
	{
		if(ast_node.type == 2 )
			js_code = ast_generate_js(ast_node.nodes[1]) + ast_node.op + ast_generate_js(ast_node.nodes[0]);
		else if (ast_node.type == 3)
		{
			var op_func = ast_node.op == "*=" ? ast_node.nodes[0].type == 2 ? "numeric.muleq(" : "numeric.dot(" : "numeric.diveq(";
			js_code = op_func + ast_generate_js(ast_node.nodes[1]) + ', ' + ast_generate_js(ast_node.nodes[0]) + ")";
		}
	}
	else if (ast_node.op == ".()")
	{
		js_code = ast_node.opts.fname + '(' + ast_generate_js(ast_node.nodes[ast_node.nodes.length-1]);
		
		for(var i=ast_node.nodes.length-2; i>=0; i--)
		{
			js_code += ', ' + ast_generate_js(ast_node.nodes[i]);
		}
		js_code += ')';
		
		if (ast_node.opts.multireturn === true)
			js_code += '[0]'; // multi return functions returns array of variables, we will take the first if no one handles explicitly ( fix for a = svd(..) or svd(..) )
	}	
	else if(ast_node.op == '[]')
	{
		if(ast_node.nodes.length == 2)
			js_code = ast_generate_js(ast_node.nodes[1]) + '.charCodeAt(' + ast_generate_js(ast_node.nodes[0]) + ')'; // string
		else
			js_code = ast_generate_js(ast_node.nodes[2]) + '[' + ast_generate_js(ast_node.nodes[1]) + '][' + ast_generate_js(ast_node.nodes[0]) + ']';
	}
	else if(ast_node.op == '()')
	{
		if(ast_node.opts.tempdelegate)
			js_code = ast_node.opts.fname + '(' + ast_generate_js(ast_node.nodes[ast_node.nodes.length-1]) + ')(';
		else 
			js_code = ast_node.opts.fname + '(';
		
		for(var i=ast_node.nodes.length-2; i>=0; i--)
		{
			js_code += ast_generate_js(ast_node.nodes[i]) + ((i!=0) ? ', ' : '');
		}
		js_code += ')';
		
		if (ast_node.opts.multireturn === true)
			js_code += '[0]'; // multi return functions returns array of variables, we will take the first if no one handles explicitly ( fix for a = svd(..) or svd(..) )
	}
	else if(ast_node.op == '[]=')
	{
		js_code = ast_generate_js(ast_node.nodes[1]) + ' = ' + ast_generate_js(ast_node.nodes[0]);
	}
	else if(ast_node.op == '[..]')
	{
		js_code = '[';
		for(var i=ast_node.opts.rows-1; i>=0; i--)
		{
			js_code += '[';
			for(var j=ast_node.opts.cols-1; j>=0; j--)
			{
				js_code += ast_generate_js(ast_node.nodes[i*ast_node.opts.cols+j]) + ((j!=0) ? ', ' : '');
			}
			js_code += ']' + ((i!=0) ? ', ' : '');
		}
		js_code += ']';
		//js_code = ast_generate_js(ast_node.nodes[0]) + '[' + ast_generate_js(ast_node.nodes[2]) + '][' + ast_generate_js(ast_node.nodes[3]) + '] = ' + ast_generate_js(ast_node.nodes[1]);
	}
	else if(ast_node.op == '[:]' || ast_node.op == '[:]=')
	{
		js_code = ast_node.opts.mode + '(' + ast_generate_js(ast_node.nodes[ast_node.nodes.length-1]) ;
		for(var i=ast_node.nodes.length-2; i>=0; i--)
		{
			js_code += ', ' + ast_generate_js(ast_node.nodes[i]);
		}
		js_code += ")";
	}
	else if(ast_node.op == '+' || ast_node.op == '-' || ast_node.op == '*' || ast_node.op == '/' || ast_node.op == '%' || ast_node.op == '.*' || ast_node.op == './' || IsRelop(ast_node.op) || ast_node.op == '&&'  || ast_node.op == '||')
	{
		if ( (ast_node.nodes[0].type == 2 && ast_node.nodes[1].type == 2) || 
			 (ast_node.nodes[0].type == 4 && ast_node.nodes[1].type == 2) || 
			 (ast_node.nodes[0].type == 2 && ast_node.nodes[1].type == 4) || 
			 (ast_node.nodes[0].type == 4 && ast_node.nodes[1].type == 4) ||
			 (ast_node.nodes[0].type == 1 && ast_node.nodes[1].type == 1))
			js_code = ast_generate_js(ast_node.nodes[1]) + ' ' +ast_node.op + ' ' +ast_generate_js(ast_node.nodes[0]);
		else if (ast_node.nodes[0].type == 3 && ast_node.nodes[1].type == 3 && ast_node.op == '*') 
			js_code = "cortex.dot(" + ast_generate_js(ast_node.nodes[1]) + ', ' + ast_generate_js(ast_node.nodes[0]) + ")";
		else if ( (ast_node.nodes[0].type == 3 && ast_node.nodes[1].type == 3) && (ast_node.op == '+' || ast_node.op == '-')) 
		{
			js_code = (ast_node.op == '+' ? "cortex.add_mm" : "cortex.sub_mm") + '(' + ast_generate_js(ast_node.nodes[1]) + ', ' + ast_generate_js(ast_node.nodes[0]) + ")";
		}
		else
		{		
			js_code += op_func_map[ast_node.op] + "(" + ast_generate_js(ast_node.nodes[1]) + ", " + ast_generate_js(ast_node.nodes[0]) + ")";
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
			js_code = "numeric.addeq(" + ast_generate_js(ast_node.nodes[0]) + ", " + (ast_node.op == '--$' ? "-1" : "1") + ")";
	}
	else
	{
		if ( const_vars[ast_node.op] != undefined )
			js_code = const_vars[ast_node.op];
		else if (ast_node.opts.member_offset !== undefined )
			js_code = "_this[" + ast_node.opts.member_offset + "]";
		else
			js_code = ast_node.op;
	}
	
	return js_code;
}

function ast_collect_vars(ast_node, vars)
{
	if( ast_node.op == '=' && ast_node.opts.define)
		vars.push( ast_node.nodes[1].op);
		
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
	var v = [], defstr = "";
	ast_collect_vars(root_node, v);
	for(var i=0; i<  v.length; i++)
		defstr += (i==0 ? 'var ' : ', ') + v[i];
		
	if (v.length > 0)
		defstr += ';\n' + IndentSpaces();
		
	return defstr;
}

function ast_generate_code(no_expression)
{
	var root_node = ast_from_postfix();
				
	var defs = ast_var_defines(root_node);
		
	if (cur_scope == undefined && root_node.op != '[,,]' && !no_expression)
		__ans_pos = IndentSpaces().length + compiled_js.length + defs.length;
	
	return defs + ast_generate_js(root_node);
}

var Delegate = {};
Delegate.ftable_funcs = [];
Delegate.map = [];


Delegate.GetMapName = function( var_name )
{
	if(comp_is_member(var_name))
		return (cur_scope.isConstructor ? cur_scope.name : cortexParser.getObjectDef(cur_scope.this_type).name) + "/" + var_name;
	else
	{
		var is_global = cur_scope == undefined || cur_scope.get_var_type(var_name) == undefined;
		return is_global ? var_name : cur_scope.name + "/" + var_name;
	}
}

Delegate.Assign = function( type, read_delegates, write_delegate_name)
{
	if(type != 5 && type != 6)
		return;
		
	var full_name_write = Delegate.GetMapName(write_delegate_name);
	
	for(var i = 0;i < read_delegates.length; i++)
	{
		var full_name_read = Delegate.GetMapName(read_delegates[i]);
		
		if (this.map[full_name_write] == undefined)
			this.map[full_name_write] = []; // create entry if not defined before
			
		if(this.map[full_name_read] == undefined)
		{
			this.map[full_name_write].push(full_name_read);   // transfer entries to write delegate from read delegates
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

Delegate.Dump = function()
{
	var str = "";
	for (var m in Delegate.map)
	{	
		if (!Delegate.map.hasOwnProperty(m))
		    continue;
			
		str += m + " <-- " + JSON.stringify(Delegate.map[m], null, 4) + "\n";
	}
	
	return str;
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

function PeekNextToken()
{
	var saved_inp_pos = inp_pos;
	var saved_look = Look;
	
	GetChar();
	SkipWhite();
	
	var ret = Look + LookAhead();
	
	inp_pos = saved_inp_pos;
	Look = saved_look;
	
	return ret;
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
	var a = inp.substring(inp_pos-1, inp_pos + x.length - 1);
	if ( a == x && !IsAlNum( inp[inp_pos + x.length - 1] ) )
	 return true;
	 
	return false;
}

function IsLambdaExpr()
{
	var saved_inp_pos = inp_pos;
	var saved_look = Look;
	
	var parens = Look == '(';
	
	if(parens)
	{
		Match('(');
		if(Look == ')')  // empty lambda ( )
		{
			inp_pos = saved_inp_pos;
			Look = saved_look;
			return true;
		}
	}
	
	if (!IsAlpha(Look))
	{
		inp_pos = saved_inp_pos;
		Look = saved_look;
		return false;
	}

	while (IsAlNum(Look))
	{
		GetChar();
	}

	SkipWhite();
	
	var flag = false;
	
	if(parens)
	{
		if( (Look == ')' && PeekNextToken() == '=>') || Look == ',')
			flag = true;     // (a,.. or (a)
	}
	else
	{
		if(Look == '=' && LookAhead() == '>')
			flag = true;    // a => 
	}
			
	inp_pos = saved_inp_pos;
	Look = saved_look;
	return flag;
}

function Expected(s)
{
	Error_parse(s + " expected");
}


function Emitln_ast(js, cout)
{
	compiled_js += IndentSpaces() + js + "\n";
	compiled_c += IndentSpaces() + (cout ? cout : js)  + "\n";
}


function EmitFuncln_ast(js, cout)
{
	functions_js += IndentSpaces() + js + "\n";
	functions_c += IndentSpaces() + (cout? cout : js) + "\n";
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

function GetNameList(sep, end, optional)
{
	var list = new Array();
	
	while(Look != end)
	{
		var new_item = GetName();
		
		for(var i=0; i < list.length; i++)
			if (new_item == list[i])
				Error_parse("Names should be different :'" + new_item + "'");
		list.push(new_item);
		
		if (Look != end)
		{
			if(optional)
			{
				if( Look == sep)
					Match(sep);
			}
			else
				Match(sep);
		}
	}
	return list;
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
				
				ast_postfix_push(num, 2, 0, "GetMatrix");
		}
		
		if (type != 2)
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
	
	var ast=ast_postfix_push("[..]", 3, num_rows * num_cols, "GetMatrix");
	ast.opts.rows = num_rows;
	ast.opts.cols = num_cols;
	
	rvalue[rvalue_pos] = true;
}

function IncIndent()
{
	cur_indent++;
}

function DecIndent()
{
	cur_indent--;
}

function IndentSpaces()
{
	return Array(cur_indent*4).join(" ");
}


////////////// PARSER
function AddSubOp(top_type, op)
{
	Match(op);
	
	var reg0_type = Term();	
	
	var opmode = top_type + "_" + reg0_type;
	
	switch(opmode)
	{
		case "2_2":
			return 2;
		case "2_3":
		case "3_2":
		case "3_3":
			rvalue[rvalue_pos] = true;
			return 3;
		case "4_2":
		case "2_4":
		case "4_4":
			if(op != '-')
			{
				rvalue[rvalue_pos] = true;
				return 4;
			}
			break;
	}
	
	Error_parse( "'" + op +"' operator is not supported for types: '" + type_names[top_type] + "' and '" + type_names[reg0_type] + "'");
}

function MulDivOpElm(top_type, op)
{
	if (op == './')
	{
		Match('.');
		Match('/');
	}
	else if (op == '.*')
	{
		Match('.');
		Match('*');
	}
	
	var reg0_type = Unary();
	
	if (top_type != 3 || reg0_type != 3)
		Error_parse("Matrix type required for element wise matrix operations");
	
	rvalue[rvalue_pos] = true;
	return 3;
}

function MulDivOp(top_type, op)
{
	Match(op);
	
	var reg0_type = Unary();
	
	if (top_type == 2)
	{
		if (reg0_type == 2)
		{
			return 2;
		}
		else if (reg0_type == 3)
		{
			if (op=='*')
			{
				rvalue[rvalue_pos] = true;
				return 3;
			}
			else
			{			
				Error_parse(op == '/' ? "Real division by matrix is undefined." : "Remainder by matrix is undefined.");
			}
		}		
	}
	else if (top_type == 3)
	{
		if (reg0_type == 2)
		{
			rvalue[rvalue_pos] = true;
			return 3;
		}
		else if(reg0_type == 3)
		{
			if (op=='*' || op == '%')
			{
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
	
	Error_parse( "'" + op +"' operator is not supported for types: '" + type_names[top_type] + "' and '" + type_names[reg0_type] + "'");
}

function IncDecPostfix()
{
	var type = IndexMemberFunc();
	var op = undefined;
	
	if( Look == '+' && LookAhead() == '+')
	{
		op = '+';
	}
	else if( Look == '-' && LookAhead() == '-')
	{
		op = '-';
	}
	
	if(op)
	{
		if(!is_lvalue_last(true))
			Error_parse("Invalid increment operand");

		if(type == 3)
			Error_parse("Use prefix notation for matrix increment/decrement for efficiency. (ex : '++M' )"); // postfix for matrices seem inefficient so disabled for now
		
		if( type != 2)
			Error_parse("Increment decrement operator is only supported for reals"); // postfix for matrices seem inefficient so disabled for now
		
		Match(op);
		Match(op);
		
		if(op == '+')
			ast_postfix_push("$++", type, 1, "IncPostfix");
		else
			ast_postfix_push("$--", type, 1, "DecPostfix");
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
		
		ast_postfix_push("'", type, 1, "transpose");
	}
		
	return type;
}

function Ident(namespace)
{
	var type;
	var is_lambda;
	
	if (IsAlpha(Look) || (is_lambda = IsLambdaExpr()) )
	{
		var Name = is_lambda ? "function" : GetName();
		
		if (Name === "class")
		{
			// ex nihilo definition and creation 
			type = DoClassDefExNihilo();
			return type;
		}
		else if (Name  == "function")
		{		
			Name = "_anonymous_" + anonymous_uid;
			DoFunction(false, true);
		}
		
		if(current_module_name.length > 0)
			Name += '$' + current_module_name;
			
		if(namespace)
			Name += '$' + namespace;
		
		type = comp_try_get_var_type(Name);
		
		/*if(type ===99999)
			Error_parse("Uninitialized variable is used: '" + Name + "'");*/
		
		var ast = ast_postfix_push(Name, type, 0);
		
		if(type == 5 || type == 6)
			ast.opts.read_delegates = [Delegate.GetMapName(Name)];
		
		if(comp_is_member(Name))
			ast.opts.member_offset = cur_scope.members ? cur_scope.members[Name][1] : cur_scope.vars_rel_pos[Name];
		
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
		ast_postfix_push( '"' + str + '"', type, 0);
		Match('"');
	}
	else
	{
		var num = GetNum();
		type = 2;
		
		ast_postfix_push(num, type, 0);
	}
	
	return type;
}


function IndexMemberFunc(multireturn)
{
	var type = Factor();
	
	while(Look == "(" || Look == '[' || Look == '.' && (LookAhead() != '*' && LookAhead() != '/'))
	{	
		if(Look == '(')
		{
			if(type == 5 || cortexParser.isObject(type) )  // static function
			{
				if ( !( ast_postfix.length > 0 && IsAlpha(ast_postfix[ast_postfix.length-1].op[0])))
					Error_parse("Function name expected");
				var Name = ast_postfix[ast_postfix.length-1].op;
				
				var return_types = FuncCall(Name, false, false);
			}
			else if(type == 6) // function pointer
			{
				if ( ( ast_postfix.length > 0 && IsAlpha(ast_postfix[ast_postfix.length-1].op[0])))
					var Name = ast_postfix[ast_postfix.length-1].op;
				else
				{
					var Name = "_temp_delegate" + (anonymous_uid++);
					Delegate.Assign( type, ast_postfix[ast_postfix.length-1].opts.read_delegates , Name); 
				}
				var return_types = FuncCall(Name, false, true);
			}
			else if(type == 8) // class method
			{
				if ( !( ast_postfix.length > 0 && IsAlpha(ast_postfix[ast_postfix.length-1].op[0])))
					Error_parse("Method name expected");
				
				var MemberName = ast_postfix[ast_postfix.length-1].op;
				ast_postfix[ast_postfix.length-1].op = "_this";
				var return_types = MethodCall(cortexParser.getObjectDef(cur_scope.this_type), MemberName, cur_scope.this_type);
			}
			else
				Error_parse("Callable type expected");
			
			if(multireturn)
				type = return_types;
			else
			{
				ClearUnusedParams(return_types, 1, return_types.length);
				type = return_types[0];
				type = type == 5 ? 6 : type;
			}
		}
		
		if(Look == '[')
		{
			if (type==4)
			{
				StringIndexer();
				ast_postfix_push( "[]", 2, 2);
				type = 2;
			}
			else if (type==3)
			{
				var multiple = MatrixIndexer();

				if (!multiple)
				{
					ast_postfix_push( "[]", 2, 3);
					
					type = 2;
				}
				else
				{
					switch(multiple)
					{
						case 102:
							var ast = ast_postfix_push("[:]", type, 5, "get_slice()");
							ast.opts.mode = "cortex.getslice";
							break;
						case 100:
							var ast = ast_postfix_push("[:]", type, 4, "get_slice(1)");
							ast.opts.mode = "cortex.getcol";
							break;
						case 101:
							var ast = ast_postfix_push("[:]", type, 4, "get_slice(2)");
							ast.opts.mode = "cortex.getrow";
							break;
					}
					
					rvalue[rvalue_pos] = true;
					type = 3;
				}
			}
			else
			{
				Error_parse("Indexer [] operator only works for matrices and strings.");
			}
		}
		
		if(Look == '.' && (LookAhead() != '*' && LookAhead() != '/'))
		{
			if(type == undefined)
				Error_parse("Undefined class or module");
			if(type == 9) // module
				type = ModuleResolution();
			else
				type = MemberAccess(type);
		}
		
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
		
		type = IncDecPostfix();
		
		if( type != 2 && type != 3)
			Error_parse("Increment decrement operator is only supported for reals and matrices");
			
		if(!is_lvalue_last(true))
			Error_parse("Invalid increment operand");			
		
		ast_postfix_push(op+op + "$", type, 1, "IncDecPrefix");
	}
	else
	{
		type = IncDecPostfix();
	}
	
	return type;
}

///////////////////////////////////////
//Parse and Translate a Relation

function RelOp(top_type, op)
{	
	var reg0_type = ColonOp();
	
	if (reg0_type ==4 && top_type==4)
	{
		if (op !='==' && op != '!=')
		{
			Error_parse("Invalid string operator.");
		}
		
		ast_postfix_push(op, 1, 2);
	
		return 1;
	}
	else if ((reg0_type == 6 || reg0_type ==5) && (top_type == 6 || top_type == 5))
	{
		ast_postfix_push(op, 1, 2);

		return 1;
	}
	else if(reg0_type ==3 && top_type==3)
	{
		if (op !='==' && op != '!=')
		{
			Error_parse("Invalid matrix operator.");
		}
		
		ast_postfix_push(op, 1, 2);
		
		return 1;
	}
	
	
	if (reg0_type !=2 || top_type!=2)
	{
		Error_parse("Relational operations are not supported for the given types: '" + type_names[reg0_type] + "' and '" + type_names[top_type] + "'");
		return 2;
	}
	
    ast_postfix_push(op, 1, 2);
	
	return 1;
}

function ColonOp()
{
	var type = ArithmeticExpr();
	
	if(Look == ':')
	{
		if(type != 2)
			Error_parse("Real type expected");

		Match(":");
	
		type = ArithmeticExpr();
		if(type != 2)
			Error_parse("Real type expected");
		
		if(Look == ':')
		{
			Match(":");
			type = ArithmeticExpr();
			if(type != 2)
				Error_parse("Real type expected");
			
			ast_postfix_push(":", 3, 3);
		}
		else		
			ast_postfix_push(":", 3, 2);
			
		type = 3;
	}
	
	return type;
}

function Relation()
{
	var type = ColonOp();
	var r;
	if (IsRelop(Look, LookAhead() ))
	{
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


//Parse and Translate a Boolean Term
function BoolTerm()
{
	var type = Relation();
	while (Look == '&' && LookAhead() == '&')
	{	
		Match('&');Match('&');
		var rhs_type = Relation();
		
		if(rhs_type != 1 || type != 1)
			Error_parse('Boolean operations are supported only for boolean type');
		
		ast_postfix_push('&&', type, 2);
	}

	return type;
}

function is_lvalue_last(incdec)
{
	var last_node = ast_postfix[ast_postfix.length-1];
	
	return IsAlpha(last_node.op[0]) ||						// a = expr
		(last_node.op == '[]') 		|| 						// a[0,0] = expr
		(last_node.op == '[:]' && incdec == false) ||  		// a[0:1,2:3] = expr
		(last_node.op == '.' ); 							// c.m() = expr 
		//(last_node.op == '.()' ); 							// c.M() = expr ??
}


function AssignMember(type_rhs)
{
	rvalue_pos++;
	rvalue[rvalue_pos] = false;
		
	var delegatename = ast_postfix[ast_postfix.length-1].opts.delegatename;
	
	var type = Expression();
	if(type == 5)
		type = 6;
	if(type !== type_rhs)
		Error_parse("Deduced type '" + type_names[type] + "' is different from member type '" + type_names[type_rhs] + "'.");
	
	if(type == 6)  // handles assignment to delegate : d1 = f1, d2 = d1, d3 = m(...)
	{
		Delegate.Assign( type, ast_postfix[ast_postfix.length-1].opts.read_delegates , delegatename); 
	}
	
	var ast_eq = ast_postfix_push('=', type, 2);
	
	if (rvalue[rvalue_pos]==false)
	{
		if (type==3)
		{
			ast_eq.opts.dubmat = true;
		}
		else if (type==4)
		{
			//javascript does not need copy for string but other virtual machines may need
			//Emitln("asm_reg0_dub_s();");
		}
	}

	
	rvalue_pos--;
	
	return type;
}

function AssignVar(Name)
{
	rvalue_pos++;
	rvalue[rvalue_pos] = false;
	
	var type = Expression();

	var is_var_local = IsNewDefinition(Name);
	
	if(type == 5)
		type = 6;
	
	if ( const_vars[Name] != undefined )
	{
		Error_parse("Can not change const value.")
	}
	
	comp_define_var(Name, type);	
	
	if(type == 6)  // handles assignment to delegate : d1 = f1, d2 = d1, d3 = m(...)
	{
		var read_delegates = ast_postfix[ast_postfix.length-1].opts.read_delegates;		
		Delegate.Assign(type, Delegate.GetMapName(read_delegates), Delegate.GetMapName(Name) );
	}
	
	
	if( comp_is_member(Name))
	{
		is_var_local = false;
		
		ast_postfix[0].opts.member_offset = cur_scope.vars_rel_pos[Name];
	}
	
	
	var ast_eq = ast_postfix_push('=', type, 2);
	ast_eq.opts.define = is_var_local;
	
	if (rvalue[rvalue_pos]==false)
	{
		if (type==3)
		{
			ast_eq.opts.dubmat = true;
		}
		else if (type==4)
		{
			//javascript does not need copy for string but other virtual machines may need
			//Emitln("asm_reg0_dub_s();");
		}
	}
	

	
	rvalue_pos--;
		
	return type;
}

function AssignIndexed(sliced)
{
	var type;
	
	if (!sliced)   // a[0,2] = 5
	{
		type = Expression();
		ast_postfix_push('[]=', type, 2);
	}
	else if (sliced) // a[0:1,2] = [0,1] or a[0,1:2] = [0;1] or a[0:1,1:2] = [0,1;3,4]
	{
		var ast_removed = ast_postfix.pop();
		var mode = ast_removed.opts.mode;
	    type = Expression();
			
		var ast = ast_postfix_push('[:]=', type, ast_removed.nodes.length + 1);
		
		if(mode == "cortex.getslice")
			mode = "cortex.setslice";
		else if(mode == "cortex.getcol")
			mode = "cortex.setcol";
		else if(mode == "cortex.getrow")
			mode = "cortex.setrow";
		ast.opts.mode = mode;
	}
	else 
		Error_parse("Internal error subscribt");
		
	return type;
}

function AssignInplace(type)
{
	var op = Look;
	Match(op);
	Match('=');
	
	var Name = ast_postfix[ast_postfix.length-1].op;
	
	var rhs_type = Expression();
	if(op == '+' || op == '-')
	{
		if(type != rhs_type && !(type==3 && rhs_type==2))
			Error_parse( "Assignment types does not match : " + type_names[type] + ", " + type_names[rhs_type]);
		if(type == 4 && op == '-')
			Error_parse("Operation not supported on type : " + type_names[type]);
		if(type != 2 && type !=3 && type != 4)
			Error_parse("Operation not supported on type : " + type_names[type]);
		ast_postfix_push(op + '=', type, 2);
	}
	else if(op == '*' || op == '/')
	{
		if(type == 2 && rhs_type == 2 || type == 3 && rhs_type == 3 && op == '*' || type == 3 && rhs_type == 2 && op == '*')
		{
			ast_postfix_push(op + '=', type, 2);
		}
		else
			Error_parse("Operation not supported on types : " + type_names[type] + ", " + type_names[rhs_type]);
		
	}
}

function Expression()
{
	var last_index = ast_postfix.length;
	
	var type = BoolOr();
	if((Look == '+' || Look == '-' || Look == '*' || Look == '/') && LookAhead() == '=')
	{
		AssignInplace( type );
	}
	else if(Look == '=')
	{
		Match('=');
		
		var last_node = ast_postfix[ast_postfix.length-1];
		
		if(IsAlpha(last_node.op[0])) // a = expr
		{
			var Name = last_node.op;
			type = AssignVar(Name);
		}
		else if (last_node.op == '[]') // a[0,0] = expr
		{
			type = AssignIndexed(false);
		}
		else if (last_node.op == '.') // c1.m1 = expr
		{
			type = AssignMember(type);
		}
		else if ( last_node.op == '[:]') // a[0:1,2:3] = expr
		{
			type = AssignIndexed(true);
		}
		
		if(type === 8) 
			Error_parse("Delegates to methods not supported");
	}
	
	if( IsAlpha(ast_postfix[ast_postfix.length-1].op[0]) && (type === 99999 || type ===undefined) )
		Error_parse("Undefined variable : '" + ast_postfix[ast_postfix.length-1].op + "'.");
		
	return type;
}

//Parse and Translate an Expression
function ExpressionNew()  // $$$ remove 
{
	var type = Expression();
		
	last_expression_type = type;
	
	return type;
}

//Parse and Translate an Expression
function BoolOr()
{
	var type;
	
	type = BoolTerm();
	while (Look == '|' && LookAhead() == '|')
	{
		Match('|');Match('|');
		
		var rhs_type = BoolTerm();
		
		if(rhs_type != 1 || type != 1)
			Error_parse('Boolean operations are supported only for boolean type');
		
		ast_postfix_push('||', type, 2);
	}
	
	
	return type;
}


function Term()
{
	var type;
	
	type = Unary();
	while ( (Look == '*' && LookAhead()!= '=' ) || (Look == '/' && LookAhead()!= '=' ) || (Look == '%' && LookAhead()!= '=' ) || (Look == '.' && LookAhead() == '*')|| (Look == '.' && LookAhead() == '/') )
	{
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
		case '%':
			type = MulDivOp(type,'%');
			ast_postfix_push("%", type, 2);
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

	if (Look == '(' && !IsLambdaExpr() ) // IsLambdaExpr is for skipping lambda expression ex: (x,y) => x+y or ( )
	{
		Match('(');
		type = Expression();
		ast_postfix_push('(', type, 1);
		
		Match(')');
	}
	else
		type = Ident();
		
	return type;
}


function Unary()
{
	var type;
	
	if (Look == '+' && LookAhead() != '+' && LookAhead() != '=' )
	{
		GetChar();
	}
	else if (Look == '-' && LookAhead() != '-' && LookAhead() != '=') //unary
	{
		GetChar();
		if (IsDigit(Look))
		{	
			var num = -GetNum(); // ex : a = 2*-2 
			type = 2;
			
			ast_postfix_push(num, 2 , 0, "Unary");
		}
		else
		{
			ast_postfix_push('0', 2 , 0, "Unary");
			
			type  = Transpose();
			if(type != 2 && type != 3)
			if(type != 2 && type != 3)
				Error_parse("Unary '-' only supported for reals and matrices");
			
			ast_postfix_push('-', type , 2, "Unary");
			ast_postfix_push("(", type , 1, "Unary");
		}
	}
	else if (Look == '!') 
	{
		Match('!');
		type = Transpose();
		
		if(type != 1)
			Error_parse('Boolean operations are supported only for boolean type');
		
		ast_postfix_push('!', type, 1);
	}
	else
	{
		type = Transpose();
	}

	return type;
}



function FuncCall(Name, IsCmd, IsDelegate, IsMethod)
{
	var count = 0;
	var params_type=new Array();
	var params_delegate=new Array();
	
	if(IsMethod !== undefined)
	{
		params_type[count] = IsMethod;
		params_delegate[count] = undefined;
		count++;
	}
	
	if(!IsCmd)
	{
		Match('(');
		
		// parse function params
		while( Look != ')')
		{
			params_type[count] = Expression();
			params_delegate[count] = ast_postfix[ast_postfix.length-1].opts.read_delegates;
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
			ast_postfix_push( '"' + param_name + '"', 4, 0);
			count++;
		}
	}
	

	var func_desc = user_func_codes[Name + ':' + count];
	if(IsMethod && func_desc) 
		func_desc.isMethod = IsMethod;
	
	var return_types;
	var return_delegates = {};
	if (!IsDelegate)
		return_types = LinkFunc(Name, count, params_type, return_delegates, params_delegate);
	else
	{
		return_types = LinkDelegation(Name, count, params_type, return_delegates, params_delegate);
	}
	
	var func_name = GetLinkFunctionName(Name, params_type, count);
	
	
	if(func_desc && func_desc.isClassDef)	
		func_name += "_ctor";	
	
	if(!IsDelegate)
	{
		var ast_node = ast_postfix_push("()", return_types[0], count + 1);
		ast_node.opts.fname = '_' + func_name;
	}
	else
	{
		var suffix = GetFtableFuncName( params_type, count, return_types );
		var ast_node = ast_postfix_push("()", return_types[0], count + 1);
		if (Name.indexOf("_temp_delegate") == 0)
		{
			ast_node.opts.fname = "asm_fjump_table_" + suffix;
			ast_node.opts.tempdelegate = true;
		}
		else
			ast_node.opts.fname = "asm_fjump_table_" + suffix + "("+ Name + ")";
	}
	
	ast_node.opts.multireturn = return_types.length > 1;
	ast_node.opts.return_delegates = return_delegates;
	ast_node.opts.read_delegates = return_delegates.delegates;
	ast_node.opts.ctor = func_desc && func_desc.isClassDef;

	return return_types;
}

function LinkDelegation(Name, count, params_type, return_delegates, params_delegate)
{
	var return_types;
	var full_name = Delegate.GetMapName( Name );
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
		}
	}
}

function StringIndexer()
{
	Match('[');
	var type = Expression();
	Match(']');
	
	if (type != 2)
	{
		Error_parse("Invalid indexer type.");
	}
}

// A[1, :]
function IndexerOnlyColon(multiple, isrow)
{
	Match(':');
	
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
	var type = ArithmeticExpr();

	if (type!=2)
	{
		Error_parse("Invalid indexer type.");
	}
	
	if (isrow)
		multiple = 100; 
	else
	{
		multiple = (multiple == 100) ? 102 : 101;
	}
	
	return multiple;
}

function MatrixIndexer()
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
		type = ArithmeticExpr();
		
		if (type!=2)
		{
			Error_parse("Invalid indexer type.");
		}
		
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
			type = ArithmeticExpr();
		}
		else
		{
			ast_postfix_push("0", 2, 0);
			type = 2;
		}
			
		if (type!=2)
		{
			Error_parse("Invalid indexer type.");
		}
		
		if (Look == ':')
		{
			multiple = IndexColonRange(multiple, false);
		}
	}
	
	if (!vector)
		Match(']');
		
	return multiple;
}

function ObjectDefs(name, members)
{
	this.name = name;
	this.members = members;
}

function DefineClass(className, members, methods)
{
	var prevDef = cortexParser.getObjectType( className );
	if(prevDef == -1)
	{
		type_names[ ObjectList.length + 101 ] = className;
		ObjectList.push( { name : className, members : members, methods : methods } );
		
		return cortexParser.getObjectType( className );
	}
	else
	{
		cortexParser.getObjectDef(prevDef).members = members;
		cortexParser.getObjectDef(prevDef).methods = methods;
		return prevDef;
	}
}

cortexParser.isObject = function(type)
{
	return type >= 101 && type <= 101 + ObjectList.length
	
}

cortexParser.getObjectType = function(name)
{
	for(var i = 0; i < ObjectList.length; i++)
	{
		if(ObjectList[i].name === name)
			return i + 101;
	}
	
	return -1;
}

cortexParser.getObjectDef = function(type)
{
	if(!cortexParser.isObject(type))
		Error_parse("Object is not defined: " + type);
	
	return ObjectList[type-101];
}

function ModuleResolution()
{
	if ( !( ast_postfix.length > 0 && IsAlpha(ast_postfix[ast_postfix.length-1].op[0])))
		Error_parse("Module name expected");
	
	var lib_name = ast_postfix[ast_postfix.length-1].op;
	ast_postfix.pop();
	Match('.');
	
	return Ident(lib_name);;
}

function MemberAccess(type)
{
	Match('.');
	var MemberName = GetName();
	
	var objDesc = cortexParser.getObjectDef(type);
	if(!objDesc)
		Error_parse("Invalid class");

	var memberDesc = objDesc.members[MemberName];
	if(memberDesc)
	{
		var memberType = memberDesc[0];
	
		ast_postfix_push(memberDesc[1] , 2, 0);
		var ast = ast_postfix_push(".", memberType, 2);
		ast.opts.delegatename = objDesc.name + "/" + MemberName;

		type = memberType;

		ast.opts.read_delegates = [ objDesc.name + "/" + MemberName ];
	}
	else
	{
		var return_types = MethodCall(objDesc, MemberName, type);
		type = return_types;
	}
	
	return type;
}

function MethodCall(objDesc, methodName, objType)
{
	var methodDesc = objDesc.methods ? objDesc.methods[methodName] : undefined;
	if(methodDesc === undefined)
		Error_parse("Object does not have a method or member : '" + methodName + "'");

	var  func_desc_name = objDesc.name + "_method_" +  methodName;
	var return_types = FuncCall( func_desc_name, false, false, objType );
	ClearUnusedParams(return_types, 1, return_types.length);
	
	var ast = ast_postfix[ast_postfix.length-1];
	ast.op = ".()";
	ast.nodes.pop();
	return return_types;
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
	
	this.global_promoted = {};
	this.local_enforced = {};
	this.members_pos = 0;
	
	this.define_var = function(name, type)
	{
		for(var i=0;i<keywords.length;i++)
			if (keywords[i] == name)
				Error_parse("Can not define reserved words as variables");
		//cortex.print("define_var : " + name + " : " + type + "  " + (this == global_scope));
			
		if(this.vars[name]===undefined)
		{
			this.vars[name] = 0;
			
			if(this.isConstructor && !this.local_enforced[name])
				this.vars_rel_pos[name] = this.members_pos++;
			else
				this.vars_rel_pos[name] = this.stack_rel_pos++;
		}
		else
		{
			if(this.vars_deduced[name]!==undefined && this.vars_deduced[name] != type && this.vars_deduced[name] !== 99999)
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
		//cortex.print("define_param : " + name + " : " + type);
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
	
	this.get_local_var_type = function(name)
	{
		return this.vars_type[name];
	}
	
	this.get_var_type = function(name)
	{
		var var_type = this.vars_type[name];
		
		if(var_type === undefined && this.members !== undefined && this.members[name] !==undefined)
			return this.members[name][0];
		
		if(var_type === undefined && this.methods !== undefined && this.methods[name] !==undefined)
			return 8;
		
		return var_type;
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
}


function ArithmeticExpr()
{
	var type;
	
	if (IsAddop(Look) && Look != LookAhead() && LookAhead() != '=')
	{
		type = 2;
		ast_postfix_push('0', 2 , 0, "ArithmeticExpr");
	}
	else
	{
		type = Term();
	}

	while ( (Look == '+' && LookAhead() !='+' && LookAhead() != '=') || (Look == '-' && LookAhead() !='-' && LookAhead() != '=') )
	{
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


function FunctionMultiReturn(func_desc)
{
	Match('[');
	func_desc.multiassign_names = GetNameList(',' , ']', true);
	func_desc.multiassign_count = func_desc.multiassign_names.length;
	
	Match(']');
	Match('=');
}

// Parses function name, prototype and body and stores them. Does not compile function body(DoFunctionLink compiles)
function DoFunction(isClassDef, isAnon)
{
	var func_desc = {};
	
	var braces = 1;
	
	var rtype_name = isAnon ? "function" : GetName();
	var rtype = 2;
	
	if (rtype_name != "function")
		for (var i=0;i<type_names.length;i++)
			if (type_names[i] == rtype_name) rtype = i;
	
	var multiassign = ( Look == '[') && !isClassDef;
	
	if(multiassign)
		FunctionMultiReturn(func_desc);	
	
	var Name;
	if(isAnon)
		Name = "_anonymous_" + (anonymous_uid++);
	else
		Name = GetName();
	
	if(current_module_name.length > 0)
		Name += '$' + current_module_name;
		
	Match('(');
	func_desc.proto_param_names = GetNameList(',', ')' , false);
	func_desc.proto_param_count = func_desc.proto_param_names.length;
	Match(')');
	
	var lambda_form = false;
	if( Look == '=' && LookAhead() == '>')
	{	
		Match('='); 
		Match('>'); 
		lambda_form = true;
	}
	else
		Match('{');
	
	func_desc.name = Name;	
	func_desc.module_name = current_module_name;
	
	if(!lambda_form || Look == '{')
	{
		func_desc.code = (lambda_form ? "" : "{ ") + Look;
		func_desc.code_pos = inp_pos - 3; // used for error reporting only
		
		while(true)  // bug : what happens when comments contain { or } ?
		{
			GetChar();
			func_desc.code += Look;
			
			if (Look =='{')
			{
			   braces++;
			}
			else if (Look=='}')
				braces--;
			
			if(braces==0)
				break;
			
			if(end_of_prog)
				Error_parse("Unexpected end of file.");
		}
		Match('}');
	}
	else
	{
		func_desc.code = "{ return " + Look;
		func_desc.code_pos = inp_pos - 11; // used for error reporting only

		while(true)  // bug : what happens when comments contain { or } ?
		{
			GetChar();
			func_desc.code += Look;
			
			if(end_of_prog)
				Error_parse("Unexpected end of file.");
				
			if (Look ==';')
			{
				//Match(';');
				break;
			}
		}
		func_desc.code += '}';
	}
	
	if(cur_scope && cur_scope.isConstructor && !isAnon)
	{
		if(cur_scope.defined_members === undefined)
			cur_scope.defined_members = {};
		cur_scope.defined_members[Name] = "member";
		func_desc.proto_param_count++;
		func_desc.proto_param_names.unshift("_this");
		
		DefineFunction(cur_scope.name + "_method_" + Name, func_desc, rtype);
	}
	else
	{
		if(cur_scope && !isAnon)
		{
			Error_parse("Inline functions are not supported.");
		}
		
		func_desc.isClassDef = (isClassDef === true);
		
		DefineFunction(Name, func_desc, rtype);
	}
}

function DoModule()
{
	GetName();
	var module_name = GetName();
	var module_code = "";
	var braces = 1;
	
	Match('{');
	
	while(true)  // bug : what happens when comments contain { or } ?
	{
		module_code += Look;		
		GetChar();
		
		if (Look =='{')
		{
		   braces++;
		}
		else if (Look=='}')
			braces--;
		
		if(braces==0)
			break;
		
		if(end_of_prog)
			Error_parse("Unexpected end of file.");
	}
		
	//module_code += '}';
	
	Match('}');
	
	DoImport(module_code, module_name);
}

function DefineFunction(Name, func_desc, rtype)
{
	var func_desc_name = Name + ':' + func_desc.proto_param_count;
	
	if (user_func_codes[func_desc_name] != undefined)
		Error_parse("Function already defined: '" + Name + "'.");
	
	user_func_codes[func_desc_name] = func_desc;
	
	comp_define_var_const(Name, function_list.length , 5);
	function_list.push( new FunctionDefs(Name, new Array(func_desc.proto_param_count), [rtype] , "user", true) );
}

function SaveCompileState()
{
	var state = {};
	state.old_inp = inp;
	state.old_inp_pos = inp_pos;
	state.old_look = Look;
	state.old_indent = cur_indent;	
	state.report_pos_old = report_pos;
	
	return state;
}

function RestoreCompileState( state )
{
	inp = state.old_inp;
	inp_pos = state.old_inp_pos;
	Look = state.old_look;
	cur_indent = state.old_indent;
	report_pos = state.report_pos_old;
	end_of_prog = false;
}

function DoFunctionLink(func_name, func_desc, params_count, params_type, return_delegates, params_delegate)
{
	var old_compile_state = SaveCompileState();
	var old_func_name; // for reporting
	
	inp = func_desc.code;
	inp_pos = 0;
	end_of_prog = false; 
	cur_indent = 0;
	report_pos = func_desc.code_pos; // for reporting
	old_func_name = cortexParser.current_function_name; // for reporting
	cortexParser.current_function_name = func_desc.name; // for reporting
	cortexParser.current_module_name_link = func_desc.module_name; // for reporting
	
	var param_description = "";
	
	GetChar();
	SkipWhite();
	
	if (func_desc.isClassDef) 	
	   var js_def = 'function _' + func_name + '_ctor( ';
	else
	   var js_def = 'function _' + func_name + '(';
	
	for(var i=0;i < params_count; i++)
	{
	   if (i != 0)
		  js_def += ' , ';
	   js_def += func_desc.proto_param_names[i];
	   param_description += type_names[ params_type[ i] ] + " ";
	}
	
	if ( func_desc.proto_param_count != params_count)
	{
		Error_parse("Invalid number of parameters.");
	}
	
	var compiled_js_saved = compiled_js;
	var compiled_c_saved = compiled_c;
	var ast_postfix_saved = ast_postfix.slice(); // dublicate
	
	compiled_js = "";
	compiled_c = "";
	ast_postfix = new Array();
	
	Emitln_ast( js_def + ')    // ' + param_description + '\n{');
	IncIndent();
	
	cur_scope = new VariableScope();
	cur_scope.name = func_name;
	if (func_desc.isClassDef) 
	   cur_scope.isConstructor = true;
	if (func_desc.isMethod)
		cur_scope.this_type = func_desc.isMethod;
	scope_stack.push(cur_scope);
	
	if(func_desc.isMethod != undefined)
	{	
		var objDesc = cortexParser.getObjectDef(func_desc.isMethod);
		cur_scope.members = objDesc.members;
		cur_scope.methods = objDesc.methods;
	}
		
	for(var i=0;i < params_count; i++)
	{
		if(params_type[i] == 5 || params_type[i] == 6)
		{
			cur_scope.define_param(func_desc.proto_param_names[i], 6, -params_count-1 +i);
			Delegate.Assign(params_type[i], params_delegate[i], func_desc.proto_param_names[i]); 
		}
		else
		{
			cur_scope.define_param(func_desc.proto_param_names[i], params_type[i], -params_count-1 +i);
		}
	}
	
	var rtype;
	
	if(func_desc.isClassDef) // class cName(a,b) { .. } 
	{
	    Emitln_ast("var _this = new Array(");
		var size_pos_js = compiled_js.length - 1;
		var size_pos_c = compiled_c.length - 1;
		
		StatementBlock();
		if (cur_scope.return_type !== undefined)
			Error_parse("No return allowed in class constructor.");
		
		// we can determine the size of class after statement block. so we have to insert size afterwards
		compiled_js = [compiled_js.slice(0, size_pos_js), cur_scope.members_pos + ");", compiled_js.slice(size_pos_js)].join(''); 
		compiled_c = [compiled_c.slice(0, size_pos_c), cur_scope.members_pos + ");", compiled_c.slice(size_pos_c)].join(''); 
		
		var type_id = DoClassDef(func_name);
		
		Emitln_ast("return _this;");
		cur_scope.return_type = type_id;
	}
	else
	{
		if (func_desc.multiassign_count)
		{
			for(var i=0; i < func_desc.multiassign_count; i++)
			{
				cur_scope.define_var(func_desc.multiassign_names[i], 99999); 
			}
		}
		
		if (!StatementBlock())
		{
			if (!func_desc.multiassign_count)
			{
				if (cur_scope.return_type == undefined || cur_scope.return_type == 2)
					DoReturn(true); // assume return 0 if previously not defined or previously defined as real
				else
					Error_parse("Not all code paths return a value.");
			}
		}
	}
	
	if (func_desc.multiassign_count)
    {
		var ret_str = "return [";
		
	    if(cur_scope.return_type !== undefined)
		    Error_parse("No return allowed in functions that has multiple return variables.");
		
		rtype = new Array(func_desc.multiassign_count);
		return_delegates.delegates_multi = [];
		
		for(var i=0; i < func_desc.multiassign_count; i++)
		{
			rtype[i] = cur_scope.get_var_type(func_desc.multiassign_names[i]);
			if(rtype[i] === 99999)
				Error_parse("Variable is not assigned before returning from function : '" + func_desc.multiassign_names[i] + "'");
			ret_str += func_desc.multiassign_names[i] + ((i == func_desc.multiassign_count-1) ? "" : ", ");
			
			if(Delegate.map[ cur_scope.name + "/" + func_desc.multiassign_names[i]])
			{
				Delegate.map[cur_scope.name + "/retDel" + (i == 0 ? "" : i)] = Delegate.map[ cur_scope.name + "/" + func_desc.multiassign_names[i]];
				delete Delegate.map[ cur_scope.name + "/" + func_desc.multiassign_names[i]];
			}
			
			return_delegates.delegates_multi[i] = Delegate.map[ cur_scope.name + "/retDel" + (i == 0 ? "" : i)];
		}
		
		Emitln_ast(ret_str + "];");
		
		return_delegates.delegates = Delegate.map[ cur_scope.name + "/retDel"];
		
	}
	else
	{	
		rtype = [cur_scope.return_type];
		return_delegates.delegates = Delegate.map[ cur_scope.name + "/retDel"];
	}
	var rvalue = cur_scope.rvalue_all;
	
	
	scope_stack.pop();
	if(scope_stack.length == 0)
		cur_scope = undefined;
	else
		cur_scope = scope_stack[scope_stack.length-1];

	DecIndent();
	Emitln_ast("}\n");
	
	functions_js += compiled_js;
	functions_c += compiled_c;
	compiled_js = compiled_js_saved;
	compiled_c = compiled_c_saved;
	ast_postfix = ast_postfix_saved.slice();
	
	RestoreCompileState(old_compile_state);
	cortexParser.current_function_name = old_func_name;
	
	return [ rtype, rvalue];
}

function DoClassDef(className)
{
    var members = {};
	
	var ind = 0;
	for (var member_name in cur_scope.vars)
	{
		if (!cur_scope.vars.hasOwnProperty(member_name) || cur_scope.vars_rel_pos[member_name] < 0
			|| cur_scope.global_promoted[ member_name ] || cur_scope.local_enforced[ member_name ])
			continue;
			
		members[member_name] = [ cur_scope.vars_type[member_name], ind++];	
	}
	
	var class_type = DefineClass(className, members, cur_scope.defined_members );
	comp_define_var_const(className, "'" + className + "'" , class_type);
	
	return cortexParser.getObjectType(className);
}

function DoClassDefExNihilo()
{
	var className;
	var members = {};
	
	if( Look != "{")
		className = GetName();
	else
		className = "_anonymous_" + (anonymous_uid++);
	
	Match('{');
	
	var param_count = 0;
	var proto_param_names = new Array();
	var params_type = new Array();
	var params_delegate=new Array();
	var code = "{";
	
	ast_postfix_push(className, 5, 0);
	while(Look != '}')
	{
		var member_name = GetName();
		members[member_name] = [0,param_count];
		Match(':');	
		
		params_type[param_count] = Expression();
		if(Look == ';')
			Match(';');
		
		params_delegate[param_count] = ast_postfix[ast_postfix.length-1].opts.read_delegates;
		
		code += member_name + " = _" + member_name + ";";
		members[member_name][0] = params_type[param_count];
		proto_param_names[param_count] = "_" + member_name;
		
		if(Look != '}')
			Match(',');
		param_count++;
	}
	code += ";}";
	Match('}');

	var func_name = GetLinkFunctionName(className, params_type, param_count);
	var class_type_id = DefineClass(func_name, members, { } );
	
	var ast_node = ast_postfix_push("()", class_type_id, param_count + 1);
	ast_node.opts.fname = '_' + func_name + "_ctor";
	ast_node.opts.ctor = true;
	
	var func_desc = {code : code, name : func_name + "_ctor", proto_param_count: param_count, proto_param_names : proto_param_names, isClassDef : true, module_name : current_module_name};
	DefineFunction(className, func_desc, class_type_id);
	
	var return_delegates = {};
	LinkFunc(className , param_count, params_type, return_delegates, params_delegate);
	
	comp_define_var_const(className, "'" + className + "'" , class_type_id);
	
	return cortexParser.getObjectType(func_name);
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
		ast_postfix_push("0", 2, 0);
	}
	else
		var rtype = Expression();
		
	if (rvalue[rvalue_pos] == false)
		cur_scope.rvalue_all = false;
	

	rvalue_pos--;
	
	if(rtype == 5) rtype = 6;
	var read_delegates = ast_postfix[ast_postfix.length - 1].opts.read_delegates;	
	Delegate.Assign( rtype, Delegate.GetMapName(read_delegates), cur_scope.name + "/retDel"); 	
	
	if (cur_scope.return_type != undefined && rtype != cur_scope.return_type)
		Error_parse("Deduced return type is different from previous defined type.");

	cur_scope.return_type = rtype;

	Emitln_ast("return "+ ast_generate_code(true) + "; //" + type_names[ rtype ]);
	return rtype;	
}

/////// Flow Control ////

function DoIf()
{
	Match('(');
	var type = ExpressionNew();
	
	Emitln_ast("if (" + ast_generate_code(true) + "){");
	if (type!=1 && type != 2)
	{
		Error_parse("Unsupported if condition");
	}
		
	Match(')');
	
	IncIndent();
	
	var is_return_main = Statement();
	
	DecIndent();
	
	if (CheckAhead('else'))
	{
		Emitln_ast("}\n"+ IndentSpaces() + "else\n"+ IndentSpaces() + "{" );
		Match('e');Match('l');Match('s');Match('e');
		
		IncIndent();
		var is_return_else = Statement();
		DecIndent();
	}
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
	
	if(Look != ';')
	{
		var type_exp = ExpressionNew();
		
		ast_for_cond = ast_generate_code(true);
	}
	Match(';');
	
	var compiled_each = "";
	
	if(Look != ')')
	{
		ExpressionNew();
		ast_for_next = ast_generate_code(true);
	}
	
	if (type_exp !== undefined)
	{
		if (type_exp!=1 && type_exp !=2)
			Error_parse("Unsupported if condition");
	}
	var scope = get_scope();
	scope.for_while_track.push(1);
	
	Emitln_ast(ast_for_init + "; // for init\nfor( ; " + ast_for_cond + "; " + ast_for_next + ") {");
	
	Match(')');
	IncIndent();
	Statement();
	DecIndent();
	Emitln_ast("}\n");
	
	scope.for_while_track.pop();
}

function DoWhile()
{	
	Match('(');
	var type = ExpressionNew();
	
	Emitln_ast("while (" + ast_generate_code(true) + "){");
	
	IncIndent();
	
	if (type!=1 && type != 2)
	{
		Error_parse("Unsupported if condition");
	}
	
	var scope = get_scope();
	scope.for_while_track.push(1);
	
	Match(')');
	Statement();
	DecIndent();
	
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
	}
	else
	{
		comp_define_var(Name, 2);
	}
	
	var type = comp_get_var_type(Name);
	
	if (type!=2)
		Error_parse("Real type expected.");
	
	Match(',');	

	var exp_type_check = ExpressionNew();
	if (exp_type_check!=2)
		Error_parse("Real type expected.");
	

	if (exp_type_check!=1 && exp_type_check!=2)
	{
		Error_parse("Unsupported loop expression.");
	}
		
	Emitln_ast("for(" + (isNameDefined ? "":"var ") + Name + "=" + (is_zero_begin ? "0" : begin_ast_js) + ";" + Name +"<" + ast_generate_code(true) + ";" + Name + "++) {");
	
	var scope = get_scope();
	scope.for_while_track.push(1);
	
	Match(')');
	IncIndent();
	Statement();
	DecIndent();
	
	scope.for_while_track.pop();
	
	Emitln_ast("}\n");
}

function DoImport(module_code, name)
{	
	var old_state = SaveCompileState();
	
	inp = module_code;
	inp_pos = 0;
	end_of_prog = false; 
	//report_pos = name;
	var old_module_name = current_module_name;
	current_module_name = name;
	
	GetChar();
	SkipWhite();
	
	while(!end_of_prog)
	{
		if (CheckAhead("function") || CheckAhead("real") || CheckAhead("matrix") || CheckAhead("string") || CheckAhead("bool"))
		{
			DoFunction();
		}
		else if (CheckAhead("class"))
		{
			DoFunction(true);
		}
		else
		{
			Statement();
		}
	}
	
	RestoreCompileState(old_state);
	current_module_name = old_module_name;
		
	comp_define_var_const(name, '"' + module_code + '"', 9); 
}

function DoPragma()
{
	var name = GetName();
	if(Look == ';')
		cortexParser.print(cortexParser.options[name]);
	else
	{
		var val = GetName();
		
		if (val == 'JS' || val == 'ASM')
			cortexParser.options[name] = val;
		else
			Error_parse("Invalid pragma option 'execute' : " + val);
	}
	
	Match(';');
	
}


function IsNewDefinition(Name)
{
	var is_def_new = (cur_scope !== undefined) || (cur_scope === undefined && comp_try_get_var_type(Name) == undefined);
	if( cur_scope && (cur_scope.global_promoted[Name] || cur_scope.vars_rel_pos[Name] < 0))
		is_def_new = false;
	return is_def_new;
}


function ClearUnusedParams(return_types, start, end)
{
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
	ast_postfix_push(Name, 5, 0);
	if(Name == 'typeof')
		Error_parse("'typeof' can not be called in command style, use typeof(..)");
	var return_types = FuncCall(Name, true);
	
	ClearUnusedParams(return_types, 1, return_types.length);
}

function DoVar()
{
	GetName();
	if(cur_scope === undefined)
		Error_parse("Can only use 'var' in function scopes.");
	
	while(true)
	{
		var saved_inp_pos = inp_pos;
		var saved_look = Look;
		
		var var_name = GetName();

		if(cur_scope.get_local_var_type(var_name) !== undefined)
			Error_parse("Local variable already defined. '" + var_name + "'");
		cur_scope.local_enforced[var_name] = true;
		if(Look == '=')
		{
			inp_pos = saved_inp_pos;
			Look = saved_look;
			ExpressionNew();
			Emitln_ast( ast_generate_code() + ";");
		}
		
		if(Look != ',')
			break;
		Match(',');
	}
	
	Match(';');
}

// [ s v d] = svd(A)
function MultiAssignment()
{	
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

	rvalue_pos++;
	rvalue[rvalue_pos] = false;
	
	var return_types = IndexMemberFunc(true);
	
	var return_delegates = ast_postfix[ast_postfix.length-1].opts.return_delegates;
	
	if(return_types.length <= 1)
		Error_parse("Function does not have multiple return values.");
	if (num_names > return_types.length)
		Error_parse("Function does not have enough return values.");
	
	ClearUnusedParams(return_types, num_names, return_types.length);
	
	var type = return_types[num_names - 1];
	
	comp_define_var(Names[num_names - 1], type);
	if (type==3 && rvalue[rvalue_pos] == false)
	{
		ast.opts.dubmat = true;
	}
	
	rvalue_pos--;
	
	for (var i=num_names - 2;i >=0 ;i--)
	{
		comp_define_var(Names[i], return_types[i]);
		
		if (return_types[i]==3 /*&& assignment_copy_needed*/)
		{
			//Emitln("asm_reg0_dub_matrix();");
		}
	}
	
	var ast = ast_postfix_push("[,,]", -1, 1);
	ast.opts.names = new Array(num_names);
	ast.opts.define = new Array(num_names);
	for (var i=0;i < num_names ;i++)
	{
		ast.opts.define[i] = IsNewDefinition(Names[i]);
		if( !comp_is_member(Names[i]))
			ast.opts.names[i] = Names[i];
		else
		{
			ast.opts.names[i] = "_this[" + cur_scope.vars_rel_pos[Names[i]] + "]";
			ast.opts.define[i] = false;
		}
		
		if(return_delegates.delegates_multi && return_delegates.delegates_multi[i]) 
			Delegate.Assign(return_types[i], return_delegates.delegates_multi[i], Delegate.GetMapName(ast.opts.names[i]));
	}
	
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
		return all_paths_return;
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

		Emitln_ast("break;");
	}
	else if (CheckAhead("continue"))
	{
		GetName();
		var scope = get_scope();
		if(scope.for_while_track.length == 0)
			Error_parse("continue should be in for or while.");
		
		Emitln_ast("continue;");
	}
	else if (CheckAhead("global"))
	{
		GetName();
		if(cur_scope === undefined)
			Error_parse("Can only use 'global' in function scopes.");
		var var_list = GetNameList( ',' , ';' , false );
		for(var i=0; i< var_list.length; i++)
		{
			if(cur_scope.get_var_type(var_list[i]) !== undefined)
				Error_parse("Global variable already defined. '" + var_list[i] + "'");
			cur_scope.global_promoted[var_list[i]] = true;
			if(global_scope.get_var_type(var_list[i]) === undefined)
				global_scope.define_var(var_list[i], 99999);
		}
	}
	else if (CheckAhead("var"))
	{
		DoVar();
	}
	else if (CheckAhead("if"))
	{
		GetName();
		if( DoIf() )
			all_paths_return = true;
	}
	else if (CheckAhead("function") || CheckAhead("real") || CheckAhead("matrix") || CheckAhead("string") || CheckAhead("bool"))
	{
		DoFunction();
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

function PreloadItem()
{
	Match('"');
	PreloadList.image_src.push( GetString() );
	Match('"');
	
	if (CheckAhead("as"))
	{
		GetName();
		Match('"');
		PreloadList.image_alias.push( GetString() );
		Match('"');
	}
	else
	{
		PreloadList.image_alias.push( "__" );
	}
}

function Preload()
{
	PreloadList.preload = false;
	
	while(CheckAhead("preload"))
	{
		PreloadList.preload = true;
		
		GetName();
		if(Look != '{')
		{
			PreloadItem();
		}
		else
		{
			Match('{');
			while ( Look != "}") 
			{
				PreloadItem();
				
				if (Look == "}")
					break;
					
				Match(",");
			}
			//Block();
			Match('}');
		}
	}
}


function ParseImport()
{
	GetName();	
	
	var lib_src, lib_alias;

	if(Look == '"')
	{
		Match('"');
		lib_src = GetString(); // escape name ??
		Match('"');
	}
	else 
	{	
		lib_src = GetName();
	}
	
	var lib_alias = undefined;
	
	if(CheckAhead("as"))
		lib_alias = GetName();

	var test_module1 = " function f1(x ) =>  x+1; function f2(x) => x-1; g1 = 1";
	var test_module2 = " function f1(x ) =>  x+2; function f2(x) => x-2; g1 = 2";
	var test_module3 = " class C1(){ a = 3; b = 4; function m1(x) => x + a;}";
	
	var lib_code = "";
	if(lib_src == "lib1")
		lib_code = test_module1;
	else if(lib_src == "lib2")
		lib_code = test_module2;
	else if(lib_src == "lib3")
		lib_code = test_module3;
	else
		Error_parse("Module not found : '" + lib_src + "'");
	
	var pre_module = cur_module;
	cur_module = { name : lib_src, alias : lib_alias } ;
	//module_stack.push(cur_module);
	//...
	DoImport( lib_code, lib_src );
	
	cur_module = pre_module;
	
}

function Program()
{
	DoImport(module_cortex_static, "");
	Preload();
	
	while(!end_of_prog)
	{
		/*if (CheckAhead("function") || CheckAhead("real") || CheckAhead("matrix") || CheckAhead("string") || CheckAhead("bool"))
		{
			DoFunction();
		}
		else */if (CheckAhead("class"))
		{
			DoFunction(true);
		}
		else if(CheckAhead("import"))
		{
			ParseImport();
		}
		else if(CheckAhead("module"))
		{
			DoModule();
		}
		else if (CheckAhead("clear"))
		{
			GetName();
			var var_name = GetName();
			if(var_name=="all")
			{
				comp_clear_all();
				Emitln_ast("cortex.heap = new Array(1000);");
			}
			else
			{

				comp_clear_var(var_name);
			}
		}
		else
		{
			Statement();
		}
	}
	
	if (__ans_pos >= 0)
		compiled_js = compiled_js.slice(0, __ans_pos) + "cortex.__ans = " + compiled_js.slice(__ans_pos);

	
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
			s += "  case " + Delegate.ftable_funcs[type][n] + " : " + (ast ? "return " : "") + "_" + func_gen_names[n + type_suffix] + (ast ? "" : "()") + "; break;\n";
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
	this.ast_body = ast_body;  // used by eig, lu, svd etc
}


var function_list = new Array( 
new FunctionDefs("error", [ 4 ], [4], "	cortex.error_run(param0);" , false),
//new FunctionDefs("exit", [ 2 ], [2], "	cortex.error_run(param0);" , false),
new FunctionDefs("sum", [ 3 ], [2 ], "	asm_reg0_real = numeric.sum(param0);" , false),
new FunctionDefs("det", [ 3 ], [2 ], "	asm_reg0_real = numeric.det(param0);" , false),
new FunctionDefs("inv", [ 3 ], [3 ], "	try { asm_reg0 = numeric.inv(param0);} catch(err){ cortex.error_run('Non invertible matrix'); }" , false),
new FunctionDefs("trans", [ 3 ], [3 ], "	asm_reg0 = numeric.transpose(param0);" , false),
new FunctionDefs("diag", [ 3 ], [3 ], "	asm_reg0 = numeric.diag(param0[0]);" , false),
new FunctionDefs("ones", [ 2 ], [3 ], "	asm_reg0 = cortex.rep([param0,param0],1);" , false),
new FunctionDefs("ones", [ 2,2 ], [3 ], "	asm_reg0 = cortex.rep([param0,param1],1);" , false),
new FunctionDefs("zeros", [ 2 ], [3 ], "	asm_reg0 = cortex.rep([param0,param0],0);" , false),
new FunctionDefs("zeros", [ 2,2 ], [3 ], "	asm_reg0 = cortex.rep([param0,param1],0);" , false),
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
\n\	asm_stack[asm_sp++] = asm_reg0; \
\n\	asm_reg0 = [r.S]; \
\n\	asm_stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = r.V;' , false, 
'	var r = numeric.svd(param0);\n	return [r.U, [r.S], r.V];'
),		
new FunctionDefs("linsolve", [3,3], [ 3 ], 
"\	if(param0.length != param0[0].length) cortex.error_run('matrix must be square.');\
\n\	if(param0[0].length != param1.length) cortex.error_run('matrix size mismatch.');\
\n\	asm_reg0 =  asm_util_array_to_column_matrix(numeric.solve(param0, asm_util_column_matrix_to_array(param1), false));" , false),
new FunctionDefs("lu", [3], [ 3,3 ], 
"\	if(param0.length != param0[0].length) cortex.error_run('matrix must be square.');\
\n\	var r = numeric.LU(param0); \
\n\	asm_reg0 = r.LU ; \
\n\	asm_stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = [r.P];" , false,
'	var r = numeric.LU(param0);\n	return [r.LU, [r.P]];'
),
new FunctionDefs("cholesky", [3], [ 3 ], 
"\	if(param0.length != param0[0].length) cortex.error_run('matrix must be square.');\
\n\	var r = cortex.cholesky(param0); \
\n\	asm_reg0 = r; " , false),
new FunctionDefs("eig", [3], [ 3,3,3,3 ], 
"\	var r = cortex.eig(param0); \
\n\	asm_reg0 = r[0]; \
\n\	asm_stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = r[1];\
\n\	asm_stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = r[2];\
\n\	asm_stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = r[3];" 
, false,
'\	var r = cortex.eig(param0);\n	return r;'
),
new FunctionDefs("fft", [3, 3], [ 3,3], 
"\	var z = (new numeric.T(param0[0], param1[0])).fft(); \
\n\	asm_reg0 = [z.x]; \
\n\	asm_stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = [z.y];"
, false,
'\	var z = (new numeric.T(param0[0], param1[0])).fft();return [ [z.x], [z.y]];'
),
new FunctionDefs("fft", [3], [ 3,3], 
"\	var z = (new numeric.T(param0[0])).fft(); \
\n\	asm_reg0 = [z.x]; \
\n\	asm_stack[asm_sp++] = asm_reg0;\
\n\	asm_reg0 = [z.y];"
, false,
'\	var z = (new numeric.T(param0[0])).fft();return [ [z.x], [z.y]];'
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
new FunctionDefs("title", [4], [ 7 ], "	updateTitle( undefined, param0 )\n	" , false),
new FunctionDefs("title", [2, 4], [ 7 ], "	updateTitle( param0,  param1)\n	" , false),
new FunctionDefs("imshow", [3 ], [ 2 ], "	asm_reg0_real = showImage(param0);\n	" , false),
new FunctionDefs("imshow", [3,3,3 ], [ 2 ], "	asm_reg0_real = showImage(param0,param1,param2);\n	" , false),
new FunctionDefs("imread", [ 4 ], [ 3,3,3 ], 
'\	var r = imageRead(param0); \
\n\	asm_reg0 = r.R ; \
\n\	asm_stack[asm_sp++] = asm_reg0; \
\n\	asm_reg0 = r.G; \
\n\	asm_stack[asm_sp++] = asm_reg0;\
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
new FunctionDefs("numel", [3], [ 2 ], 
"\	asm_reg0_real = param0.length*param0[0].length;" , false),
//new FunctionDefs("size", [3], [ 2,2], 
//"\	asm_reg0_real = param0.length;" , false, 'return [param0.length, param0[0].length];'),
new FunctionDefs("tic", [ ], [ 7 ], 
"\	cortex.ticTime = new Date();asm_reg0 = undefined" , false),
new FunctionDefs("toc", [ ], [ 2 ], 
"\	asm_reg0_real = (new Date())- cortex.ticTime;" , false),
new FunctionDefs("clc", [ ], [7 ], "	document.getElementById('output_win_txt').innerHTML = ''\n	asm_reg0 = undefined;" , false),
new FunctionDefs("animstop", [ 2 ], [ 7 ], "	cortex.stopAnim();" , false),
new FunctionDefs("animstop", [  ], [ 7 ], "	cortex.stopAnim();" , false),
new FunctionDefs("animsize", [  2,2 ], [ 7 ], "	cortex.animSize(param0, param1);" , false),
new FunctionDefs("animdraw", [ 2, 3 ], [ 7 ], "	cortex.updateAnim(param0, param1);" , false),
new FunctionDefs("animdraw", [ 2, 3, 3, 3 ], [ 7 ], "	cortex.updateAnim(param0, param1, param2, param3);" , false),
new FunctionDefs("_dotests", [  ], [ 2 ], "	asm_reg0_real = do_tests();" , false),
new FunctionDefs("_heap", [  ], [ 7 ], "	cortex.print(cortex.heap);" , false),
new FunctionDefs("_bench", [ 2 ], [ 7 ], "	asm_reag0_real = benchmark1(param0);" , false),
new FunctionDefs("_alert", [ 4 ], [ 7 ], "	alert(param0);\n	asm_reg0 = undefined;" , false),
//new FunctionDefs("_js", [ 4 ], [ 4 ], "	asm_reg0 = eval(param0);" , false),
new FunctionDefs("_compile", [  ], [ 2 ], "	if(compile( ace_editor.getSession().getValue() )) cortex.print('Success.');update_editor();" , false),

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
new FunctionDefs("typeof", [  ], [  ], "	throw 'Internal error'" , false),
new FunctionDefs("disp", [  ], [  ], "	throw 'Internal error'" , false)
);

var module_cortex_static = "\
function mean(X) \
{\
    return sum(X) / numel(X);\
}\
\
function variance(data) \
{\
    n = numel(data);\
    sum2 = 0;\
    \
    mn = sum(data) / n;\
\
    loop0(i,numrows(data))\
        loop0(j, numcols(data))\
        {\
            x = data[i,j];\
            sum2 = sum2 + (x - mn)*(x - mn);\
        }\
    \
    \
    v = sum2 / (n - 1);\
    return v;\
}\
\
function std(X) \
{\
    return sqrt(variance(X));\
}\
\
\
function diff(X)\
{\
    n = numrows(X);\
    m = numcols(X)-1;\
    ret = zeros( n, m); \
    \
    loop0(i,n)\
       loop0(j, m)\
       {\
          ret[i,j] = X[i,j+1] - X[i,j];\
       }\
    \
    return ret;\
}\
function max(X)\
{\
    n = numrows(X);\
    m = numcols(X);\
    ret = X[0,0]; \
    \
    loop0(i,n)\
       loop0(j, m)\
       {\
          if(X[i,j]> ret) \
			ret = X[i,j];\
       }\
    \
    return ret;\
}\
function min(X)\
{\
    n = numrows(X);\
    m = numcols(X);\
    ret = X[0,0]; \
    \
    loop0(i,n)\
       loop0(j, m)\
       {\
          if(X[i,j]< ret) \
			ret = X[i,j];\
       }\
    \
    return ret;\
}\
function fmod(x,y) \
{ \
    return x - floor(x / y ) * y; \
} \
";

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
	var inline_functions_js = "";
	var old_indent = cur_indent;
	cur_indent = 0;
		
	var param_str = "";
	for (var i = params_count-1; i>=0; i--)
	{
		if ( i==params_count-1)
			param_str = ' param' + i + param_str;
		else
			param_str = ' param' + i + ',' + param_str;
	}
	
	if(Name != 'anim')	
		EmitFuncln_ast( 'function _' + func_name + '(' + param_str + ') {');
	
	var ismath = Name.lastIndexOf(".") == -1 &&  eval('Math.' + Name);	
	if(ismath) 
	{	
		if( Name == 'random' && params_count != 0 )
			Error_parse(Name + ' : Invalid parameter count.');
		if( (Name == 'pow' || Name == 'atan2') && params_count != 2)
			Error_parse(Name + ' : Invalid parameter count.');		
		if( !(Name == 'max' || Name == 'min' || Name == 'pow' || Name == 'atan2' || Name == 'random') && params_count != 1 )
			Error_parse(Name + ' : Invalid parameter count.');
			
		if ( params_type[0] == 3)
		{
			if(Name == 'max' || Name == 'min')
			{
				Error_parse(Name + ' : Operation not supported on matrices.');
			}
			else
			{
				//assignment_copy_needed = false
				return_types = [3];
				
				EmitFuncln_ast( '	param0 = numeric.clone(param0);');
				EmitFuncln_ast( '	asm_util_matrix_map(param0, Math.' + Name + ');');
				EmitFuncln_ast( '	return param0;');
			}
		}
		else 
		{
			return_types = [2];
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
			
			var hold_function_js = functions_js;
			Delegate.Assign(params_type[0], params_delegate[0], "_anim_tempval" + anim_count); 
			var return_types_callback = LinkDelegation("_anim_tempval" + anim_count, 1, [2], return_delegates, [[],[],[]]);
			var suffix = GetFtableFuncName( [2], 1, return_types );
			anim_count++;
			inline_functions_js = functions_js;
			functions_js = hold_function_js;
			
			EmitFuncln_ast( 'function _' + func_name + '(' + param_str + ') {');
			EmitFuncln_ast("	cortex.startAnim(asm_fjump_table_" + suffix + "(param0), " + interval + "); ");
		}
		else
		{
			Error_parse("Function expected for first parameter.")
		}
	}
	else if ( Name =='typeof')
	{
		if ( params_count !== 1)
			Error_parse('typeof : Invalid parameter count.');
		
		EmitFuncln_ast("	return " + params_type[0] + ";");

		return_types = [2];
	}
	else if ( Name =='disp' || Name == 'print')
	{
		if ( params_count > 1)
			Error_parse('disp : Invalid parameter count.');
		
		EmitFuncln_ast( DispBody(params_type[0]));
				
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
	
	EmitFuncln_ast( '}');
	EmitFuncln_ast('');	
	
	cur_indent = old_indent;
	
	functions_js += inline_functions_js;
	
	return return_types;
}

function LinkFunc(Name, params_count, params_type, return_delegates, params_delegate)
{		
	var return_types;	

	var func_name = GetLinkFunctionName(Name, params_type, params_count);
	
	var func_desc = user_func_codes[Name + ':' + params_count];
	
	if(linked_functions[func_name] == undefined)
	{
		linked_functions[func_name] = { return_types : [2] };
		for (var i=0;i < function_list.length; i++)
			if (function_list[i].name == Name) 
				{
					linked_functions[func_name] = { return_types : [function_list[i].retvals[0]]} ;
					break;
				}
		
		if (func_desc != undefined)
		{
			var link_result = DoFunctionLink(func_name, func_desc, params_count, params_type, return_delegates, params_delegate);
			return_types = link_result[0];
			
			rvalue[rvalue_pos] = link_result[1];
		}
		else
		{
			return_types = StandartFunctions(Name, func_name, params_count, params_type, params_delegate);
			rvalue[rvalue_pos] = true;
		}
		
		linked_functions[func_name] = {return_types :return_types, delegates : return_delegates.delegates, delegates_multi : return_delegates.delegates_multi};
	}
	else
	{
		return_types = linked_functions[func_name].return_types; 
		return_delegates.delegates = linked_functions[func_name].delegates;
		return_delegates.delegates_multi = linked_functions[func_name].delegates_multi;
		
		if( func_desc == undefined)
			rvalue[rvalue_pos] = true;
	}
	
	
	return return_types;
}


function DispBody(type)
{
	var fbody = "";
	if (type ==3)
		fbody +='	cortex.print( cortex.matrix_print( param0) );\n';
	else if	(type ==2)
		fbody +='	cortex.print( cortex.format_number( param0) );\n';
	else if (type == 7)
	{
		//void
	}
	else if (type == 4)
	{
		fbody +='	cortex.print( param0 );\n';
	}
	else if (type == 5 || type == 6)
	{
		fbody +='	cortex.print( "function : " + param0 );\n';
	}
	else
	{
		fbody +='	cortex.print( param0 );\n';
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
	if (cur_scope && !cur_scope.global_promoted[ varname ])
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
	{
		r = cur_scope.get_var_type(varname);
	}
		
	if (r != undefined)	
		return r;
	
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

function comp_is_member(varname)
{
    // function params has negative index, local variables have 0+
	return cur_scope && !cur_scope.local_enforced[ varname ] && (
			(cur_scope.isConstructor && cur_scope.vars_rel_pos[varname] >= 0 && !cur_scope.global_promoted[ varname ] ) || 
			(cur_scope.members && cur_scope.members[varname] != undefined)
			);
}


function comp_clear_all()
{
	global_scope.clear_all();
	ObjectList = new Array();
	const_vars=[];
	const_vars_type=[];
	
	define_language_consts();
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

		code += "var " + v + " = cortex.heap["+ global_scope.vars_rel_pos[v] + "];\n";
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

		code += "cortex.heap["+ global_scope.vars_rel_pos[v] + "] = " + v + ";\n";
	}
	
	return code + "\n";
}



function Init(code_exe)
{
	linked_functions = [];
	inp = code_exe;
	inp_pos = 0;
	end_of_prog = false;	
	
	compiled_js = /*'"use strict"\n' +*/ import_global_scope();
	functions_js = "";
	
	compiled_c = "";
	functions_c = "";
	
	ast_postfix = new Array();
    ast_root = new Array();
	
	__ans_pos = -1;
	
	global_scope.vars_deduced = [];
	Delegate.ftable_funcs = [];
	Delegate.map = [];
	//Delegate.return_stack = [];
	Delegate.to_be_linked = [];
	
	rvalue_pos = 0;
	user_func_codes = new Array();
	report_pos = 0;
	cortexParser.current_function_name = "";
	function_list.length = function_list_lib_size;
	
	func_uid = 0;
	anonymous_uid = 0;
	func_gen_names = [];
	
	cur_scope = undefined;
	scope_stack = new Array();
	
	cur_module = { name : "", alias : "" };
	//module_stack = new Array();
	cortexParser.current_module_name_link = "";
	current_module_name = "";
		
	PreloadList.image_src = [];   // array of strings(image names)
	PreloadList.image_alias = []; // array of strings(image aliases)
	PreloadList.import_src = [];
	PreloadList.import_alias = []; 	
	
	cur_indent = 0;
	
	define_language_consts();
	
	GetChar();
	SkipWhite();
}

function dumpMap(map)
{
	var str = "";
	for (var val in map)
	{	
		if (!map.hasOwnProperty(val))
		    continue;
		str += "<b>" + val + "</b>" + ": ";
		if( typeof map[val] === "object")
			str += "<pre style='margin-left:20px'>" + dumpMap(map[val]) + "</pre>";
		else
			str += JSON.stringify(map[val], null, 4) + "\n";
		str += "\n";
	}
	
	return str;
}

cortexParser.dumpInternals = function()
{
	var json = "";//\n\n";// + Delegate.Dump() + "\n\n{\n";
	
	json += "<h3>global_scope:</h3>\n"  + dumpMap(global_scope);
	json += "<h3>Object Definitions:</h3>\n"  + dumpMap(ObjectList);
	json += "<h3>Delegate.map:</h3>\n"  + dumpMap(Delegate.map);
	json += "<h3>user_func_codes:</h3>\n"  + dumpMap(user_func_codes);
	json += "<h3>linked_functions:</h3>\n"  + dumpMap(linked_functions);
	//json += "<h3>function_list:</h3>\n"  + dumpMap(function_list);
	return json + "\n}";
}


}( window.cortexParser = window.cortexParser || {} ));