/* 三角形的心：重心 G、外心 O 与外接圆、内心 I 与内切圆。
   拖动 A/B/C 观察 G 恒在中线上、O/I 实时跟随。 */

canvas { width: 600 height: 480 padding: 40 }

A = (0, 0)
B = (8, 0)
C = (2, 5)

ABC

G = centroid(ABC)
O = circumcenter(ABC)
omega = circumcircle(ABC)
I = incenter(ABC)
iota = incircle(ABC)

F = mid(BC)
AF

label A
label B
label C
label G
label O
label I

style omega {
    stroke: #888888
    fill: none
    width: 1.5
}
style iota {
    stroke: #4a90d9
    fill: none
    width: 1.5
}
style AF {
    stroke: #aaaaaa
    width: 1
}
