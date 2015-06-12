var test_results;
var test_any_fail;
var test_num;
function test_report(result, expected, test_name)
{
	if (result == expected)
		test_results += "test " + test_num + ": '" + expected + "' success.\n"; 
	else
	{
		test_results += "<span style='color:red' >" + "test " + test_num + ":  !!!FAILED!!!! <br> expected : '" + expected + "' , result : '" + result + "'<br> '" + test_name + "'</span>\n"; 
		test_any_fail = true;
	}
}



function test_report_mat(result, expected, test_name)
{
	//if (result.eql(expected))
	if (asm_matrix_same(result, expected))
		test_results += "test " + test_num + ": success.\n";//"'== " + expected + " success.\n"; 
	else
	{
		//test_results += "'<span style='color:red' > != " + asm_matrix_print(expected, 0,0, true) + " !!!FAILED!!!!. result : '" + asm_matrix_print(result, 0,0, true) + "'</span>\n"; 
		test_results += "<span style='color:red' >" + "test " + test_num + ":  !!!FAILED!!!! <br>expected :<br>" + asm_matrix_print(expected, 0,0, true) + "<br>result :<br>" + asm_matrix_print(result, 0,0, true) + "<br>'" + test_name + "'</span>\n"; 
		test_any_fail = true;
	}
}

function test_exec(expr, result)
{	
	//test_results += "'";
	if (!cortexParser.compile(expr))
	{
		console_print("!!!FAILED!!!! Parser error: "+ expr);
		test_any_fail = true;
		return;
	}
	if (!asm_execute())
	{
		console_print("!!!FAILED!!!! Parser error: "+ expr);
		test_any_fail = true;
		return;
	}
	
	test_num++;
	
	if(cortexParser.isLastExpressionReal())
		test_report(__ans, result , expr);
	else
		test_report(__ans, result , expr);
}

function test_exec_mat(expr, result)
{	
	//test_results += "'"
	if (!cortexParser.compile(expr))
	{
		console_print("!!!FAILED!!!! Parser error: "+ expr);
		test_any_fail = true;
		return;
	}
	if (!asm_execute())
	{
		console_print("!!!FAILED!!!! Parser error:"+ expr);
		test_any_fail = true;
		//throw new Error("!!!FAILED!!!! Runtime error.");
		return;
	}
	
	test_num++;
	test_report_mat(__ans, result , expr);
}

function do_tests()
{
	//try
	{
		test_results = "";
		test_any_fail = false;
		test_num = 0;
		
		test_exec("2==2", true);
		test_exec("t=true&&true;t", true);
		test_exec("2!=3", true);
		test_exec("2!=2", false);
		test_exec("2==2 && 3<4", true);
		test_exec("2==2 || 3>4", true);
		test_exec("2==2 && 3>4", false);
		test_exec("12<=2", false);
		test_exec("12>=2", true);
		test_exec("12<=12", true);
		test_exec("-12>=-12", true);
		test_exec("3>4 && 2==2", false);
		test_exec("t=true && 2==2", true);
		test_exec("t=true && 2==(2-1)", false);
		test_exec("2!=3", true);
		test_exec("(2!=3)", true);
		test_exec("!(2!=3)", false);
		test_exec("! 2!=3", false);
		test_exec("(3>4) && (2==2)", false);
		test_exec("(3+2)>4 && 2==2", true);
		
		test_exec ( "2+3", 5);
		test_exec ( "2-3", -1);
		test_exec ( "1002+1003", 2005);
		test_exec ( "-2-3", -5);
		test_exec ( "2*3", 6);
		test_exec ( "2*-3", -6);
		test_exec ( "aa=4;2*2;2*-aa", -8);		
		test_exec ( "-2*-3", 6);
		test_exec ( "-2*3", -6);
		test_exec ( "2+(3)", 5);	
		test_exec ( "2+((2-4)*3+2*(3-2))", -2);
		test_exec ( "2+(-(2-4)*3+2*(3-2))", 10);
		test_exec ( "2+(3+(4+(5+(6+7))))", 27);
		test_exec ( "((((1+2)+3)+4)+5)+6", 21);
		test_exec ( "(1+1)*(2+1)",6);
		test_exec ( "(1)*(-2+1)",-1);
		test_exec ( "(-2)*(-2+1)",2);
		test_exec ( "2+(-2)*(-2+1)*3+1",9);
		test_exec ( "6/3*2",4);
		test_exec ( "6/-3*-2",4);
		test_exec ( "-6/3*2",-4);
		test_exec ( "-6*3/5",-3.6);
		test_exec ( "1e3",1000);
		test_exec ( "-1.1e0",-1.1);
		test_exec ( "-1.34e-1",-0.134);
		
		test_exec(' "aa"=="aa"', true);
		test_exec(' "aa"=="ab"', false);
		test_exec(' "cc"!="cc"', false);
		test_exec(' "cc"!="cb"', true);
		test_exec(' t="teststr"; t=="teststr"', true);
		test_exec(' t="teststr2"; t!="teststr"', true);
		test_exec(' t="teststr"; t=="teststr2"', false);
		test_exec(' t="teststr2"; t!="teststr2"', false);
		test_exec(' "abc" + "dfa"', "abcdfa");
		
		test_exec ( "t=[1,2;3,4]; +t[0,0]",1);
		test_exec ( "t=[1,2,4;5,6,7]; +t[1,2]",7);
		test_exec ( "t=[1,2;3,4]; +t[1][1]",4);
		test_exec_mat( "t=eye(3);  t[0,1] = -3*2;0+t", [[1, -6, 0], [ 0, 1, 0] , [ 0, 0, 1] ] );
		test_exec_mat( "t=zeros(2,2);t[1,0] = -3*2;0+t",[[0, 0], [ -6, 0]] );
		test_exec_mat( "zeros(2,4)",[[0, 0, 0, 0], [ 0, 0, 0, 0]] );
		test_exec_mat( "eye(3)",[[1, 0, 0], [ 0, 1, 0] , [ 0, 0, 1]]  );
		test_exec_mat( "+[1,2;3,4]", [[1,2],  [3,4]] );
		test_exec_mat( "2*[1,2;3,4]",[  [2,4],  [6,8]] );
		test_exec_mat( "-2*[1,2;3,4]", [  [-2,-4],  [-6,-8] ] );
		test_exec_mat( "+[1+2, 2-2; 3+5, 4+sin(0)]",[  [3,0],  [8,4] ]);
		test_exec_mat( "inv([-2,5; 12,-5])",[ [0.1,0.1],  [0.24,0.04] ]);
		test_exec_mat( "1-[1,2;3,4]",[ [0,-1],  [-2,-3] ]);
		test_exec_mat( "+[1,2;3,4]-1",[  [0,1],  [2,3] ]);
		test_exec_mat( "+[1,2;3,4]-[-5, 6;2 3]",[  [6,-4],  [1,1] ]);
		test_exec_mat( "+[1,2;3,4]*[-5, 6;2 3]",[  [-1,12],  [-7,30] ]);
		test_exec_mat( "a = [2,-2;-4,4];b = [2,4;7,8]; (-a*b) + a*b",[[0,0],[0,0]]);
		test_exec_mat( "a = [2,-2;-4,4];b = [2,4;7,8]; (a*-b) + a*b",[[0,0],[0,0]]);
		test_exec( "a = [2,-2;-4,4];b = [2,4;7,8]; trans(a*-b) == b'*-a'", true);
		test_exec( "a = [2,-2;-4,4];b = a; b[0,0] = 22; +a[0,0]", 2);
		test_exec_mat( "a = [2,-2;-4,4];b = [2,4;7,8]; ++a'*-2", [[-6,6],[2,-10]]);
		test_exec_mat( "+[1,2;3,4; 8 8]*[-5, 6,2; 3, 0, 1]",[ [1 ,6, 4],[ -3 , 18, 10],[-16,48,24] ]);
		test_exec_mat( "sin([1,2,10;3,4,12])",[  [0.841470984807897,0.909297426825682, -0.544021110889370],[ 0.141120008059867,	-0.756802495307928,  -0.536572918000435 ]] );
		test_exec_mat( "t=inv([0.1]);t", [ [10] ] );
		test_exec_mat( "clear all;[a, b, c] = svd( [1,3; 5 6]); +a*diag(b)*trans(c)", [ [1,3],[5,6] ] );
		test_exec_mat( "clear all;[a, b, c] = svd( [1,3, -2; 0 5 6; 1 5, -4;-1,8,3]); a*diag(b)*trans(c)", [ [1,3,-2],[0, 5,6],[1, 5, -4],[-1,8,3] ] );
		test_exec_mat( "M = [2.276789346244186, 0.36876537348143756, 0.45080351759679615, 0.34839300904423, 2.226159736281261; 0.42500006267800927, 2.0114856229629368, 1.307754920097068, 1.9121849241200835, 1.9878224346321076; 0.5171949409414083, 1.4852598016150296, 0.5614477365743369, 1.493025004165247, 1.6660545710474253; 0.43050497816875577, 2.8250119413714856, 2.7469056753907353, 0.06255048047751188, 0.19471221417188644; 1.2185607792343944, 1.4983534910716116, 1.0756771531887352, 0.924582748208195, 0.6864324007183313];\
		[l v] = eig(M);v1 = [v[0,0], v[1,0], v[2,0], v[3,0], v[4,0]];l1 = l[0,0];+M*trans(v1) - l1*trans(v1);", [ [0],[0 ],[0 ],[0 ],[0 ]] );
		test_exec_mat( "M = 0.1*[5, -6 1; 2 , 4 0; 0,5, 6]; b = [-1; 2; 3];x = linsolve(M,b); +M*x-b;", [ [0], [0], [0] ]);
		test_exec( "[x y] = lu(eye(3)+1);y ==[ 0 1 2] && x == [ 2 , 1 , 1 ; 0.5 , 1.5 , 0.5 ; 0.5 , 0.3333333333333333 , 1.3333333333333333 ];", true);
		
		test_exec("+[2,4;3,5] == [2,4;3,5]", 1);
		test_exec("+[2,4;3,5] == [12,4;3,5]", 0);
		test_exec("+[2,4;3,5] == [2,4;3,5;4,2]", 0);
		test_exec("+[2,4] == [2,4;3,5]", 0);
		test_exec("+[2,4;3,5] != [2,4;3,5]", 0);
		test_exec("+[2,4;3,5] != [12,4;3,5]", 1);
		test_exec("+[2,4;3,5] != [2,4;3,5;4,2]", 1);
		test_exec("+[2,4] != [2,4;3,5]", 1);
		
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];+t[1,2:3];",[[3,4]]);
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];+t[2,:];",[[5,	7,	6,	2]]);
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];+t[2,1:-1];",[[7,6,2]]);
		
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];+t[1:2,2];",[[3],[6]]);
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];+t[:,1];",[[3],[4],[7]]);
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];+t[0:-1,0];",[[1],[2],[5]]);
		
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];+t[1:2,0:2];",[[2,4,3],[5,7,6]]);
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];+t[1:1,2:2];",[[3]]);
		
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];t[1:1,:] = t[2,:]+55;",[[ 1 ,  3 ,  11,  2],[  60,  62,  61,  57],[  5,  7,  6,  2]]);
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];t[2:-1,2:-1] = t[2:-1,1:-2]+45;",[[ 1 ,  3 ,  11,  2],[  2,  4,  3,  4],[  5,  7,  52,  51]]);
		
		test_exec_mat("t = [1,3,11,2;2,4,3, 4; 5, 7 6,2];t[2:-1,2:-1] = t[2:-1,1:-2]+45;",[[ 1 ,  3 ,  11,  2],[  2,  4,  3,  4],[  5,  7,  52,  51]]);
		
		test_exec("([2 -2;1 -2] != @[2 -2;1 -2])", true);
		
		test_exec("x = rand(4, 5);y = rand(4, 5);m = x .* y;d = x ./ y;+[x[2,1] * y[2,1], x[2,1] / y[2,1]; x[0,4] * y[0,4], x[0,4] / y[0,4]] == [ m[2,1], d[2,1]; m[0,4], d[0,4 ]]", true);
		
		test_exec("numrows([1,2,4;2,3,4])", 2);
		test_exec("numcols([1,2,4;2,3,4])", 3);
		test_exec("sum([1,2,4;2,3,4])", 16);
		test_exec("det([1,4;5,6])", -14);
	
		test_exec_mat("t = 2; loop0(i,1001){ t=t+1;}; +[i,t]",[[1001, 1003]]);
		test_exec_mat("t = 45; loop(i,44,101){ t=t+1;}; +[i,t]",[[101, 102]]);
		
		test_exec_mat("t = 12; i = 0; while(i < 201){ t=t+1;i=i+1;}; +[i,t]",[[201, 213]]);
		
		test_exec("	clear all;c=0;function f(d){      c = c+d;      return 0; };  \
					loop0(i,6) {     f(i); }; +c; ", 15);
		test_exec("	clear all;c = [1,3;2,-2];function f(){   return c;} \
					a1= f();a2= f();a1[0,0] = 666;a2[0,1] = 666; if ( a1 == [ 666,3;2, -2] && a2 == [ 1, 666;2, -2]) { t=true;} else { t=false;};t ", true);
		test_exec("	clear all;c=0; function t() {  j=3;  a=7;  c = c+a;  return 0; }; \
					function g() {  t();  j=3;  a=6;  c = c+a;  return 0; }; \
					function f() {  h=4;  c = c+h;  g();  return 0; }; f();c;", 17);
					
		test_exec("clear all;function f(x) {    if(x<1) {        return 1;    } else {        return f(x-1)-2;    }} c = f(20);c;", -39);
		test_exec("t=-4;function f(x){    t=t+x;} a=f(3);a==0 && t==-1", 1);
		
		test_exec("clear all;t = 2; if(t==3) {t = 5;} else { t = 6;};t", 6);
		test_exec("clear all;c = [1,3;2,-2];function f(){   return c;} a= f(); a[0,0] = 666; a!=c;", true);
		test_exec_mat("clear all;function g(x,y){    return x+y;} \
					a = g(4,2);b = g([-4],[2]);c = g([5], 2);+[a, b[0], c[0]]", [[6,-2, 7]]);
		test_exec("t = 7; if(t==7) {t = 5;} else { t = 6;};t", 5);
		
		test_exec("clear all;t = 3;t", 3);
		
		test_exec_mat("a = (b = [2,1] )+[1,3]",[[3,4]]);
		test_exec("a = (b = 2 )+3", 5);
		
		test_exec("i = 4; i++;i", 5);
		test_exec("i = 7; ++i;i", 8);
		test_exec("i = 4; i--;i", 3);
		test_exec("i = 7; --i;i", 6);
		
		
		test_exec_mat("m = [3,2]; ++m;m", [[4,3]]);		
		test_exec_mat("m = [3,2]; --m;m", [[2,1]]);
		
		test_exec("i = 2; i+++3;", 5);
		test_exec("i = 2; ++i+3;", 6);
		test_exec("i = 2; (++i)*2+1;", 7);
		test_exec("i = 2; (i++)*2+1;", 5);
		
		test_exec("i = 2; i---3;", -1);
		test_exec("i = 2; --i-3;", -2);
		test_exec("i = 2; (--i)*2+1;", 3);
		test_exec("i = 2; (i--)*2+1;", 5);
				
		test_exec_mat("m = [3,2]; ++m+3;", [[7,6]]);
		test_exec_mat("m = [3,2]; (++m)*2+1;", [[9,7]]);
		
		
		test_exec("i =3;if(floor(i/2) != i/2) i++;i", 4);
		test_exec("s=0;for(i=0;i<10;++i)  s = s+i;s", 45);
		
		test_exec(' clear all;function f(x) {    return x; } \
					function h(x) {    return x+2;} \
					function g(x) {    return x+1;} \
					d1 = g; d1 = f; d2 = g; d2 = h; d3 = d2; \
					t = d1(1); y = d2([2,3]); z = d3("a"); t==1 && y==[4,5] && z == "a2"', true);
		
	}
	
	console_print(">> " + test_results);
	if (test_any_fail)
	{
		console_print("There are failed tests!!!");
		update_editor();
		return 1;
	}
	else
	{
		update_editor();	
		console_print("All Success. \nNumber of tests : " + test_num);
		return 0;
	}
}


// The Computer Language Benchmarks Game
// http://benchmarksgame.alioth.debian.org/
//
// contributed by Ian Osgood
// modified by Isaac Gouy
function benchmark1(n)
{


	function A(i,j) {
	  return 1/((i+j)*(i+j+1)/2+i+1);
	}

	function Au(u,v) {
	  for (var i=0; i<u.length; ++i) {
		var t = 0;
		for (var j=0; j<u.length; ++j)
		  t += A(i,j) * u[j];
		v[i] = t;
	  }
	}

	function Atu(u,v) {
	  for (var i=0; i<u.length; ++i) {
		var t = 0;
		for (var j=0; j<u.length; ++j)
		  t += A(j,i) * u[j];
		v[i] = t;
	  }
	}

	function AtAu(u,v,w) {
	  Au(u,w);
	  Atu(w,v);
	}

	function spectralnorm(n) {
	  var i, u=new Float64Array(n), v=new Float64Array(n), w=new Float64Array(n), vv=0, vBv=0;
	  for (i=0; i<n; ++i) {
		u[i] = 1; v[i] = w[i] = 0; 
	  }
	  for (i=0; i<10; ++i) {
		AtAu(u,v,w);
		AtAu(v,u,w);
	  }
	  for (i=0; i<n; ++i) {
		vBv += u[i]*v[i];
		vv  += v[i]*v[i];
	  }
	  return Math.sqrt(vBv/vv);
	}
	
	
	return  spectralnorm(n);
}



/*
function dct()
{

var a = Matrix.I(8);
var b = Matrix.Zero(8,8);
var i,j,k,l;
var s,d;
for (i=0;i<8;i++)
{
  for(j=0;j<8;j++)
  {
    if(i==0)
    {
      s=Math.sqrt(1.0/8.0);
    }
    else
    {
      s=Math.sqrt(2.0/8.0);
    };

    if(j==0)
    {
      d=Math.sqrt(1.0/8.0);
    }
    else
    {
      d=Math.sqrt(2.0/8.0);
    };

    for(k=0;k<8;k++)
    {
      for(l=0;l<8;l++)
      {
        b.elements[i][j]=b.elements[i][j]+ a.elements[k][l]* Math.cos(((2*k+1)*i*Math.PI) /(2*8))* Math.cos(((2*l+1)*j*Math.PI)/(2*8));
       };
    b.elements[i][j]= b.elements[i][j] * s*d;

    } ;
};
};


}*/