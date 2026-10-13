/* hide 指令：隐藏辅助构造对象，不渲染但参与几何计算 */

canvas {
    width: 600
    height: 400
    padding: 30
}

A = (0, 0)
B = (8, 0)
C = (3, 5)

ABC

/* 构造辅助元素：中点、中垂线、外心、外接圆 */
D = mid(AB)
E = mid(BC)
F = mid(CA)

l1 = perpendicular_bisector(AB)
l2 = perpendicular_bisector(BC)

O = l1 * l2
omega = circumcircle(ABC)

/* 隐藏所有辅助构造，只留下三角形与外接圆 */
hide D, E, F, l1, l2, O

label A, B, C

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
