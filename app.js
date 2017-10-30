const app = require('express')();
const server = require('http').Server(app)
const io = require('socket.io')(server)
const session = require('express-session')
const cookie = require('cookie')
// 保存socket对象
const users = []

function findInUsers(pn) {
  let index = -1;
  for (var j = 0, len = users.length; j < len; j++) {
    if (users[j].pn === pn)
      index = j
  }
  return index
}

function addUser(pn) {
  let index = findInUsers(pn)
  if (index === -1) //不存在则重新添加
    users.push({
      pn,
      socket: null
    })
}

function setUserSocket(pn, socket) { // 更新用户socket
  var index = findInUsers(pn)
  if (index !== -1) {
    users[index].socket = socket
  }
}

function findUser(pn) {
  var index = findInUsers(pn);
  return index > -1 ? users[index] : null;
}


// 利用mongoose控制mongodb
const mongoose = require('mongoose')
let mongoPromise = mongoose.connect('mongodb://39.106.55.194:27017/test', { useMongoClient: true, keepAlive: true })
mongoose.Promise = global.Promise
console.log('服务正在运行，端口3232')
server.listen(3232)
// 创建schema
// 聊天数据库
let chatSchema = mongoose.Schema({
  phoneNum: Number,
  chat: Array,
  with: Number
})
let chatModel = mongoose.model('chat', chatSchema)

// 用户信息
let userSchema = mongoose.Schema({
  user: String,
  password: String,
  like: Array,
  collect: Array,
  phoneNum: Number,
  imgUrl: String
})
let userModel = mongoose.model('user', userSchema)// 用户信息

// 学习模块阅读
let readingSchema = mongoose.Schema({
  name: String,
  content: String,
  imgUrl: String,
  des: String,
  date: Number,
  id: Number,
  like: Number,
  collect: Number,
  index: Number
})
let readingModel = mongoose.model('reading', readingSchema)
// 学习板块听力
let listeningSchema = mongoose.Schema({
  name: String,
  content: String,
  imgUrl: String,
  des: String,
  date: Number,
  id: Number,
  like: Number,
  collect: Number,
  index: Number
})
let listeningModel = mongoose.model('listening', listeningSchema)

let infoSchema = mongoose.Schema({
  name: String,
  content: String,
  imgUrl: String,
  des: String,
  date: Number,
  id: Number,
  like: Number,
  collect: Number,
  index: Number
})
let infoModel = mongoose.model('info', infoSchema)

let recommendSchema = mongoose.Schema({
  name: String,
  imgUrl: String,
  des: String,
  date: Number,
  id: Number,
  like: Number,
  collect: Number,
  style: String
})
let recommendModel = mongoose.model('recommend', recommendSchema)

// **************************************************
app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html')
})

io.on('connection', function (socket) {
  const cookieData = cookie.parse(socket.request.headers.cookie)
  // 在连接过程中，获取个人信息
  const to = cookieData.to
  const from = cookieData.from
  const date = +new Date()
  let toImageUrl, fromImageUrl
  userModel.findOne({ phoneNum: to })
    .then((data) => { toImageUrl = data.imgUrl || '' })
  userModel.findOne({ phoneNum: from })
    .then((data) => { fromImageUrl = data.imgUrl || '' })
  // 把socket存进数组
  addUser(from)
  setUserSocket(from, socket)
  console.log(users)
  socket.on(`${from}-${to}`, function (data) {
    const text = data.message
    if (!text || !from || !to) return
    // 操作数据库
    // 修改（添加）from的数据库
    chatModel.findOne({ phoneNum: from, with: to })
      .then((data) => {
        let arr = data ? data.chat : []
        arr.push({
          with: to,
          send: true,
          mes: text,
          date,
          toImageUrl,
          fromImageUrl
        })
        return chatModel.findOneAndUpdate({ phoneNum: from, with: to }, { phoneNum: from, with: to, chat: arr }, { upsert: true })
      })
      .catch((err) => {
        console.error(err)
      })

    chatModel.findOne({ phoneNum: to, with: from })
      .then((data) => {
        let arr = data ? data.chat : []
        arr.push({
          with: from,
          send: false,
          mes: text,
          date,
          toImageUrl,
          fromImageUrl
        })
        return chatModel.findOneAndUpdate({ phoneNum: to, with: from }, { phoneNum: to, with: from, chat: arr }, { upsert: true })
      })
      .catch((err) => {
        console.error(err)
      })
    let toSocket = findUser(to)
    if (toSocket) {
      toSocket.socket.emit(`${from}-${to}`, {
        with: from,
        mes: text,
        date,
        toImageUrl,
        fromImageUrl,
        send: false
      })
    }
  })
})

// 获取聊天记录接口
app.get('/getchat', function (req, res) {
  res.append('Access-Control-Allow-Origin', '*')
  if (!req.query || !req.query.pn || !req.query.wz) {
    res.sendStatus(403).end()
  } else {
    chatModel.findOne({ phoneNum: req.query.pn, with: req.query.wz })
      .then((data) => {
        // console.log(data)
        res.send(data)
        // res.sendStatus(200)
      }).catch((e) => {
        console.error(e)
        res.sendStatus(500).end()
      })
  }
})
// 获取chatlist(供admin使用)
app.get('/getchatlist', function (req, res) {
  res.append('Access-Control-Allow-Origin', '*')
  let userList, chatList
  let arr = []
  let flag = 0
  Promise.all([userModel.find(), chatModel.find()])
    .then((resolve) => {
      userList = resolve[0]
      chatList = resolve[1]
      userList.forEach((val) => {
        if (val.phoneNum == 10086) {
          flag++
          return
        }
        let phoneNum = val.phoneNum
        let obj = {
          phoneNum,
          imgUrl: val.imgUrl,
          user: val.user
        }
        chatModel.findOne({ phoneNum })
          .then((data) => {
            if (data) {
              let index = data.chat.length - 1
              obj.recentContent = data.chat[index].mes
              obj.recentTime = data.chat[index].date
              obj.contentItemNum = data.chat.length
            }
            flag++
            arr.push(obj)
            // 如果完成遍历
            if (flag === userList.length) {
              res.send(arr)
            }
          })
          .catch((err) => {
            console.error(err)
          })
      })
      return arr
    })
})

// 添加喜欢
app.get('/getlike', function (req, res) {
  res.append('Access-Control-Allow-Origin', '*')
  const style = req.query.style
  const id = req.query.key
  const pn = req.query.pn
  if (!style || !id || !pn) return
  let like
  let likeArray
  let i
  let promise1 = userModel.findOne({ phoneNum: pn })
    .then((data) => {
      if (!data) return
      console.log(data)
      likeArray = data.like || []
      likeArray.forEach((val, index) => {
        if (val.id === id) {
          i = index
        }
      })
      if (!i) {
        likeArray.push({
          id: id,
          type: style
        })
      }
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500).end()
    })
  let issueModel
  if (style === 'info') issueModel = infoModel
  if (style === 'reading') issueModel = readingModel
  if (style === 'listening') issueModel = listeningModel
  let promise2 = issueModel.findOne({ id })
    .then((data) => {
      if (!data) return
      like = data.like + 1
      console.log('addlike', like)
      console.log(data)
      return data
    })
    .then((data) => {
      // recommendModel.findOneAndUpdate({ id }, {
      //   '$inc': { 'like': 1 }
      // })
      // issueModel.findOneAndUpdate({ id }, {
      //   '$inc': { 'like': 1 }
      // })
      return data
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500).end()
    })

  Promise.all([promise1, promise2])
    .then((resolve) => {
      let p1, p2, p3
      if (!i) {
        // console.log(resolve[1])
        likeArray[likeArray.length - 1].detail = Object.assign({}, resolve[1]._doc, { style })
        // console.log('style', style)
        console.log('style', likeArray[likeArray.length - 1].detail)
        p1 = userModel.findOneAndUpdate({ phoneNum: pn }, {
          $set: {
            like: likeArray
          }
        })
      } else {
        console.log('存在i，不更新')
        p1 = Promise.resolve()
      }
      p2 = recommendModel.findOneAndUpdate({ id }, {
        $set: {
          like: like
        }
      })
      p3 = issueModel.findOneAndUpdate({ id }, {
        $set: {
          like: like
        }
      })
      Promise.all([p1, p2, p3])
        .then((resolve) => {
          res.sendStatus(200)
        })
    })
})

// 取消喜欢
app.get('/getdislike', function (req, res) {
  console.log('getdislike')
  res.append('Access-Control-Allow-Origin', '*')
  const style = req.query.style
  const id = req.query.id
  const pn = req.query.pn
  if (!style || !id || !pn) return
  let like
  let likeArray
  let promise1 = userModel.findOne({ phoneNum: pn })
    .then((data) => {
      if (!data) return
      likeArray = data.like || []
      let i = null
      likeArray.forEach((val, index) => {
        if (val.id === id) {
          i = index
        }
      })
      if (i) {
        console.log('目前存在数组中')
        console.log(likeArray.length)
        likeArray.splice(i, 1)
        console.log('已删除')
        console.log(likeArray.length)
      }
      console.log('finally', likeArray.length)
      userModel.findOneAndUpdate({ phoneNum: pn }, {
        $set: {
          like: likeArray
        }
      })
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500).end()
    })
  let issueModel
  if (style === 'info') issueModel = infoModel
  if (style === 'reading') issueModel = readingModel
  if (style === 'listening') issueModel = listeningModel
  let promise2 = issueModel.findOne({ id })
    .then((data) => {
      if (!data) return
      console.log(data)
      like = Math.max(0, data.like - 1)
      return data
    })
    .then((data) => {
      return data
    })
    .catch((err) => {
      console.error(err)
      res.sendStatus(500).end()
    })
  Promise.all([promise1, promise2])
    .then(() => {
      console.log('finally like', like)
      const p1 = recommendModel.findOneAndUpdate({ id }, {
        $set: {
          like: like
        }
      })
      const p2 = issueModel.findOneAndUpdate({ id }, {
        $set: {
          like: like
        }
      })
      const p3 = userModel.findOneAndUpdate({ phoneNum: pn }, {
        $set: {
          like: likeArray
        }
      })
      Promise.all([p1, p2, p3])
        .then(() => {
          res.sendStatus(200)
        })
        .catch(() => {
          res.sendStatus(500)
        })
    })
})