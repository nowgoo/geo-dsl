canvas {
    width: 600
    height: 400
    padding: 30
}

A = (0, 0)
B = (8, 0)
C = (3, 5)

ABC

D = mid(BC)
E = mid(CA)

AD
BE

G = AD * BE

O = circumcenter(ABC)
omega = circumcircle(ABC)

label A, B, C, D, E, G, O

style polygon {
    fill: none
    stroke: #222222
    width: 2
}

style omega {
    stroke: #888888
    width: 1.5
    dash: 4 2
}

style segment {
    stroke: #333333
}

style AD {
    stroke: #cc0000
    width: 2.5
}

mark parallel(AD, BE)
