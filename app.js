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
        console.error('未能操作成功1')
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
        console.error('未能操作成功2')
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
  console.log(req.query)
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