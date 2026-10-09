A = (0, 0)
B = (4, 0)

c1 = circle(A, B)
c2 = circle(B, A)

P = intersect(c1, c2, 1)
Q = intersect(c1, c2, 2)

label A, B, P, Q
