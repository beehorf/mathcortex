Mathcortex Language  ![alt text](http://mathcortex.com/images/cortexicon.png)
=
MathCortex is a simple lightweight programming language that is designed for doing numerical calculation on **web browsers**. 


Start using Mathcortex at http://mathcortex.com/. 
No installation or setup required.

###Main features are:
- Easy matrix manipulation and built-in matrix operations
- Sophisticated numerical computations like singular value decomposition(svd) and finding eigenvalues/vectors(eig)
- Implicit declarations
- Syntax similar to C and JavaScript
- Static typing, with full type inference
- Online integrated web environment
- Open source 

All the operations are done on browser for fast and server independent computing. The code is first compiled to a simple **JavaScript intermediate code**. The generated JavaScript code is evaluated and runs very fast on the browser.

Language is still being developed. 


[Documentation](http://mathcortex.com/doc/doc.html)
-



Examples
-

###Linear system of equations
```javascript

A = [5,-6, 1;
     2, 4, 0;
     0, 5, 6];

b = [-1; 2; 3];

x = linsolve(A, b);

disp(A * x - b);
```

###Singular value decomposition
```javascript

M  = [2.655,  0.3959, 2.044;
      0.9232, 3.959,  1.681;
      2.488,  2.897,  1.076];

[u s v] = svd(M);

disp(M - u * diag(s) * trans(v));

```

###Eigenvalues/vectors
```javascript

M  = [2.655,  0.3959, 2.044;
      0.9232, 3.959,  1.681;
      2.488,  2.897,  1.076];

[l v] = eig(M);

v1 = v[:,0];
disp(M * v1 - l[0] * v1);

v2 = v[:,1];
disp(M * v2 - l[1] * v2);

v3 = v[:,2];
disp(M * v3 - l[2] * v3);

```

###Plot
```javascript

x = zeros(37, 1);
y = zeros(37, 1);
loop0(i, 37)
{
   x[i][0] = 20 * sin(i * 10 * pi / 180);
   y[i][0] = 30 * cos(i * 10 * pi / 180);
}

plot(x, y);

```

###Functions
```javascript

///// simple function example
function addition(a, b)
{
  r = a + b;
  return r;
}

///// recursive function example
function f(a)
{
  disp(a);
  a = a - 1;
  if (a > 0)
  {
    f(a);
  }

  return 0;
}

///// main
f(20);

y = addition(55, 22);

```


