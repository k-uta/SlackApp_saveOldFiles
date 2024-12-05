function saveOldFiles() {
  var OAuthAccessToken   = "xoxp-UserOAuthToken"; 
  var BotUserAccessToken = "xoxb-BotUserOAuthToken";

  //アップロード先のフォルダのID
  var rootFolder = "フォルダのID";

  //保存期間(日)
  var storeDays = 0;

  //保存するファイルの最大容量
  var maxFileSize = 500; //[MB]

  //ファイルのSlack上での保存期間
  var res = filesList(storeDays, BotUserAccessToken);
  console.log("対象ファイル数が" + res.files.length + "つ存在します");
  if(res.files.length == 0){
    console.log("対象ファイルはありませんでした。");
    return;
  }

  res.files.reverse() //配列の順番を入れ替える(古い順->新しい順)

  console.log("-----------------------------------------------------------------------------------------------------------");

  var rootFolder = DriveApp.getFolderById(rootFolder);

  for (var i = 0; i < res.files.length; i++){
    var file = res.files[i];
    console.log((i + 1) + " / " + res.files.length + " ファイル目");

    //[B]->[MB]
    fileSize = file.size*0.000001;
    console.log("ID = " + file.id + ",  title = " + file.title + ",  Size = " + fileSize.toFixed(2) + "[MB]");

    //ファイルをドライブにアップロード
    moveFiles(file, BotUserAccessToken, rootFolder, maxFileSize)
    console.log("-----------------------------------------------------------------------------------------------------------");
  }
}

// slack上のファイル一覧を取得
function filesList(days, token){
  var params = {
    token: token,
    ts_to: elapsedDaysToUnixTime(days),
  };
  return execute('files.list', params);
}

// apiを実行
function execute(apiName, params){
  var options = {
    'method': 'POST',
    'payload': params,
  }
  var res = UrlFetchApp.fetch('https://slack.com/api/' + apiName,options);

  return JSON.parse(res.getContentText());
}

// 保存日数をunix時間に変換
function elapsedDaysToUnixTime(days){  
  var date = new Date();
  var now  = Math.floor(date.getTime()/ 1000); // unixtime[sec]

  return now - 8.64e4 * days + ''; // 8.64e4[sec] = 1[day] 文字列じゃないと動かないので型変換している
}

function moveFiles(file, token, rootFolder, maxFileSize) {
  try {
    // ファイル情報取得
    var fileId = file.id;
    var dlUrl = file.url_private;

    var headers = {
      "Authorization": "Bearer " + token,
    };
    var params2 = {
      "method": "GET",
      "headers": headers,
    };

    var dlData;
    try {
      // Slackからファイル取得
      dlData = UrlFetchApp.fetch(dlUrl, params2).getBlob();
      console.log("ファイル取得成功: " + dlData.getName());
    } catch (fetchError) {
      console.error("ファイル取得失敗: " + fetchError.message);
      return false; // 次のファイルに進む
    }

    var date = new Date();
    date.setDate(date.getDate() - 1); // 昨日の日付

    var yesterday = Utilities.formatDate(date, 'JST', 'yyyy_MM_dd');
    var channelName = yesterday;

    var targetFolder = rootFolder.getFoldersByName(channelName);

    var targetFolderId;
    if (!targetFolder.hasNext()) {
      console.log("フォルダが存在しないため、新規作成します: " + channelName);
      try {
        targetFolderId = rootFolder.createFolder(channelName);
      } catch (createFolderError) {
        console.error("フォルダ作成失敗: " + createFolderError.message);
        return false; // 次のファイルに進む
      }
    } else {
      targetFolderId = targetFolder.next();
      console.log("既存フォルダを取得: " + targetFolderId.getName());
    }

    var slackdate = Utilities.formatDate(new Date(file.timestamp * 1000), "JST", "yyyy_MM_dd");

    if (slackdate == yesterday) { // 昨日Slackにアップロードされたファイル
      dlData.setName(slackdate + "_" + file.title);
      try {
        console.log("ファイルをアップロード中...");
        var driveFile = targetFolderId.createFile(dlData);
        console.log("アップロード完了: [" + driveFile.getName() + "]");
        console.log("フォルダ内のファイル数: " + targetFolderId.getFiles().hasNext());
      } catch (uploadError) {
        console.error("ファイルアップロード失敗: " + uploadError.message);
        return false; // 次のファイルに進む
      }
    } else if (slackdate > yesterday) { // 昨日以降にSlackにアップロードされたファイル
      console.log("未処理(24時間以内にアップロードされます): [" + file.title + "]");
    } else { // 一昨日以前にSlackにアップロードされたファイル
      console.log("アップロード済み: [" + file.title + "]");
    }

    return true;

  } catch (generalError) {
    console.error("moveFiles関数内エラー: " + generalError.message);
    return false; // 次のファイルに進む
  }
}
