// 댓글 → DM 자동 발송 규칙
// 위에서부터 순서대로 검사해서 처음 맞는 규칙 하나만 실행합니다.
//
// media_id      : 특정 게시물에서만 동작 (생략하면 모든 게시물)
// keywords      : 댓글에 이 중 하나라도 들어 있으면 발송 (빈 배열이면 모든 댓글)
// dm            : 댓글 작성자에게 보낼 DM 내용 ({username} 자리에 작성자 아이디가 들어감)
// public_reply  : DM 발송에 성공하면 댓글에 공개로 다는 답글 (생략하면 안 달음)

export const RULES = [
  {
    // media_id: "18000000000000000",
    keywords: ["신청", "링크", "정보"],
    dm: "안녕하세요 {username}님! 댓글 감사합니다 🙌\n요청하신 링크입니다 👉 https://seedhouse.kr",
    public_reply: "@{username} DM 보내드렸어요! 📩",
  },
];
