# 基于three.js实现第一人称的碰撞检测

## Setup
Download [Node.js](https://nodejs.org/en/download/).
Run this followed commands:

``` bash
# Install dependencies (only the first time)
npm install

# Run the local server at localhost:8080
npm run dev

# Build for production in the dist/ directory
npm run build
```



## 基于three.js实现第一人称的碰撞检测

## 简介

通过three.js我们可以在网站中实现比较不错的3D效果，复现了three官网中game_fps的例子，代码基本与官网相同，注释比较全面，仅供参考。有兴趣可以下载查看一下。代码地址 https://github.com/shanchangshuiyuan/threejs-examples-recurrent  

利用git clone 地址为 

```js
git clone https://github.com/shanchangshuiyuan/threejs-examples-recurrent.git
```

预览地址：

[collision-games-fps.vercel.app](https://collision-games-fps.vercel.app/)

效果如下：

![image-20240320204840352](https://gitee.com/zhouguangyi/image-upload-blog-in-typora/raw/master/image-20240320204840352.png)

## Octree-八叉树

八叉树碰撞的检测原理我也不怎么清楚，感兴趣的可以自行百度搜索了解。
我们主要是运用three.js封装好的内置Octree模块，使用该模块只需要通过如下引入方式即可：

```js
import { Octree } from 'three/examples/jsm/math/Octree';

const worldOctree = new Octree();
```

引入该模块后，我们可以通过`fromGraphNode`为需要的场景构建节点，通过构建好的节点我们就可以实现碰撞等操作，代码很简单，如下：

```js
//使用场景对象初始化Octree数据结构，以便进行碰撞检测。
//fromGraphNode 是 Octree 的方法，用于从场景图节点构建 Octree
worldOctree.fromGraphNode(gltf.scene);
```

通过以上的简单几个步骤，我们就为碰撞检测的前提条件做好了准备，现在我们需要一个碰撞对象。 在three.js中，我们可以通过添加一个`Capsule`对象来实现碰撞检测。

## Capsule-胶囊体

为什么要使用`Capsule`对象呢？ 因为，在`Octree`中提供了`Capsule`对象碰撞的方法，让我们可以直接使用来更容易的实现碰撞检测。

```js
import { Capsule } from 'three/examples/jsm/math/Capsule';

// 创建玩家碰撞体

// 这里使用了 Capsule（胶囊体）对象，通过两个端点和半径来定义一个胶囊体，这通常用于描述游戏中的角色或物体的碰撞体积。

const playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1, 0), 0.35);
```

通过以上方式我们引入一个`Capsule`对象，注意该对象并不是一个几何体。我的意思是，它并不会在场景中存在，它仅仅用于我们碰撞检测的一个数学对象。

## 碰撞检测

在`Octree`对象中，我们可以通过`capsuleIntersect`方法来捕获`Capsule`胶囊体与所构建了八叉树节点的场景是否进行了碰撞，检测方式如下

```js
// 处理玩家与场景中其他物体碰撞
function playerCollisions() {

    // 利用场景中的 Octree（八叉树）数据结构，检测玩家碰撞体 playerCollider 与场景中的物体是否发生碰撞，返回碰撞检测结果。
    const result = worldOctree.capsuleIntersect(playerCollider);

    // 变量用于标记玩家是否处于地面上
    playerOnFloor = false;

    if (result) {

        // 检测碰撞法线方向，如果法线方向的 y 分量大于 0，则表示玩家在地面上，将 playerOnFloor 设置为 true。
        playerOnFloor = result.normal.y > 0;

        // 如果玩家不在地面上，则对玩家的速度进行修正，使其沿着碰撞法线方向反弹。
        if (!playerOnFloor) {

            // result.normal 表示碰撞法线的方向，- result.normal.dot(playerVelocity) 表示玩家速度在法线方向上的分量，
            // 这个分量乘以 -1 实现反向。然后通过 addScaledVector 方法将这个反弹方向的速度分量添加到玩家的速度上。
            playerVelocity.addScaledVector(result.normal, - result.normal.dot(playerVelocity));

        }

        // 将玩家碰撞体根据碰撞的深度（result.depth）进行移动，确保玩家不会穿过场景中的物体。
        playerCollider.translate(result.normal.multiplyScalar(result.depth));

    }

}
```

现在，我们来说一说这个`result`属性吧，该属性是一个对象，一共包含了两个值，分别是：

- depth: 碰撞的深度，可以理解为物体和场景中相机的比例
- normal：碰撞的法线向量，可以理解为碰撞的方向

如图所示：

![image-20240320205651217](https://gitee.com/zhouguangyi/image-upload-blog-in-typora/raw/master/image-20240320205651217.png)

知道了这些信息后，我们就可以很好很简单的处理碰撞的逻辑了，我们只需要如下操作：

当`Capsule`对象与场景物体碰撞后，将`depth`与`normal`法线向量相乘，得到一个新的数值。
 这个数值就是我们需要将`Capsule`对象偏移的值，偏移该值后`Capsule`对象也就不再与场景物体相碰撞了。

## 同步

注意，我们现在进行的一切操作，在场景中都是得不到体现的！
 尽管，我们可能会在不断的移动逻辑中通过`translate`修改`Capsule`的位置，又通过`capsuleIntersect`检测来修复`Capsule`的位置，但这一切都只是一个数学上的运算。

所以，我们需要将`Capsule`对象的信息同步到场景中的物体上，可以是一个简单的几何体、也可以是一个模型、当然也可以是拍摄的相机。

完整代码链接如下：请自行领取。https://github.com/shanchangshuiyuan/threejs-examples-recurrent  
